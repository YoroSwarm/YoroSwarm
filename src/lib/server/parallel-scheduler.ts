/**
 * 并行集中调度器
 * 管理任务的并行执行，同时考虑依赖关系
 * 
 * 核心设计：
 * 1. 任务图构建：分析所有任务的依赖关系，构建执行图
 * 2. 就绪队列：依赖已满足的任务进入就绪队列
 * 3. 并行执行：在资源允许的情况下并行启动多个任务
 * 4. 状态同步：任务完成后触发下游任务解锁
 */

import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { transitionTaskStatus, unlockDependentTasks } from './task-orchestrator'
import { runCognitiveTeammateLoop } from './cognitive-teammate-runner'

export interface SchedulerConfig {
  maxConcurrentTasks: number  // 最大并发任务数
  autoAssign: boolean         // 是否自动分配任务
  retryFailedTasks: boolean   // 是否自动重试失败任务
  maxRetries: number          // 最大重试次数
  retryDelayMs: number        // 重试间隔（毫秒）
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrentTasks: 3,
  autoAssign: true,
  retryFailedTasks: true,
  maxRetries: 2,
  retryDelayMs: 5000,
}

/**
 * 调度器状态
 */
interface SchedulerState {
  swarmSessionId: string
  isRunning: boolean
  runningTasks: Map<string, RunningTaskInfo>  // taskId -> task info
  queuedTasks: string[]  // 等待执行的任务ID队列
  config: SchedulerConfig
  completionAnnounced: boolean
}

interface RunningTaskInfo {
  taskId: string
  teammateId: string
  startTime: Date
  retryCount: number
}

// 内存中的调度器状态（按session管理）
const schedulerStates = new Map<string, SchedulerState>()

/**
 * 初始化调度器
 */
export async function initScheduler(
  swarmSessionId: string,
  config: Partial<SchedulerConfig> = {}
): Promise<SchedulerState> {
  const state: SchedulerState = {
    swarmSessionId,
    isRunning: false,
    runningTasks: new Map(),
    queuedTasks: [],
    config: { ...DEFAULT_CONFIG, ...config },
    completionAnnounced: false,
  }

  schedulerStates.set(swarmSessionId, state)
  return state
}

/**
 * 获取调度器状态
 */
export function getSchedulerState(swarmSessionId: string): SchedulerState | undefined {
  return schedulerStates.get(swarmSessionId)
}

/**
 * 构建任务依赖图
 */
export async function buildTaskGraph(swarmSessionId: string) {
  const tasks = await prisma.teamLeadTask.findMany({
    where: { swarmSessionId },
    include: {
      dependencies: {
        include: { dependsOnTask: true },
      },
      assignee: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  // 构建节点映射
  const taskMap = new Map(tasks.map(t => [t.id, t]))

  // 分析依赖关系
  const graph = {
    tasks,
    taskMap,
    // 前置任务映射：taskId -> 它所依赖的任务ID列表
    dependencies: new Map<string, string[]>(),
    // 后置任务映射：taskId -> 依赖于它的任务ID列表
    dependents: new Map<string, string[]>(),
    // 没有前置依赖的任务（入口点）
    entryTasks: [] as string[],
    // 没有后置依赖的任务（出口点）
    exitTasks: [] as string[],
  }

  for (const task of tasks) {
    const deps = task.dependencies.map(d => d.dependsOnTaskId)
    graph.dependencies.set(task.id, deps)

    if (deps.length === 0) {
      graph.entryTasks.push(task.id)
    }

    // 构建反向映射
    for (const depId of deps) {
      if (!graph.dependents.has(depId)) {
        graph.dependents.set(depId, [])
      }
      graph.dependents.get(depId)!.push(task.id)
    }
  }

  // 找出出口任务
  for (const task of tasks) {
    if (!graph.dependents.has(task.id) || graph.dependents.get(task.id)!.length === 0) {
      graph.exitTasks.push(task.id)
    }
  }

  return graph
}

/**
 * 获取当前可执行的任务（依赖已满足且未在执行）
 */
export async function getExecutableTasks(swarmSessionId: string): Promise<string[]> {
  const graph = await buildTaskGraph(swarmSessionId)
  const state = getSchedulerState(swarmSessionId)

  const executable: string[] = []
  const busyTeammates = new Set(Array.from(state?.runningTasks.values() || []).map(info => info.teammateId))

  for (const [taskId, deps] of graph.dependencies) {
    const task = graph.taskMap.get(taskId)
    if (!task) continue

    // 只考虑已分配且待执行的任务。未分配的 PENDING 任务不能进入执行队列。
    if (task.status !== 'PENDING' && task.status !== 'ASSIGNED') continue
    if (!task.assigneeId) continue

    // 检查是否已在执行
    if (state?.runningTasks.has(taskId)) continue

    // 同一个 teammate 同一时刻只执行一个任务，其余任务保持 ASSIGNED 等待队列。
    if (busyTeammates.has(task.assigneeId)) continue

    // 检查所有依赖是否已完成
    const allDepsCompleted = deps.every(depId => {
      const depTask = graph.taskMap.get(depId)
      return depTask?.status === 'COMPLETED'
    })

    if (allDepsCompleted) {
      executable.push(taskId)
    }
  }

  return executable
}

/**
 * 启动调度器循环
 */
export async function startScheduler(swarmSessionId: string): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) {
    await initScheduler(swarmSessionId)
  }

  const currentState = getSchedulerState(swarmSessionId)!
  if (currentState.isRunning) {
    console.log(`[Scheduler] Already running for session ${swarmSessionId}`)
    return
  }

  currentState.isRunning = true
  currentState.completionAnnounced = false
  console.log(`[Scheduler] Started for session ${swarmSessionId}`)

  // 广播调度器启动
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        action: 'scheduler_started',
        swarm_session_id: swarmSessionId,
        max_concurrent: currentState.config.maxConcurrentTasks,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // 启动调度循环
  scheduleNextBatch(swarmSessionId)
}

/**
 * 停止调度器
 */
export async function stopScheduler(swarmSessionId: string): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) return

  state.isRunning = false
  console.log(`[Scheduler] Stopped for session ${swarmSessionId}`)

  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        action: 'scheduler_stopped',
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )
}

/**
 * 调度下一批任务
 */
async function scheduleNextBatch(swarmSessionId: string): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state || !state.isRunning) return

  try {
    // 获取当前可执行的任务
    const executable = await getExecutableTasks(swarmSessionId)

    // 计算可用槽位
    const availableSlots = state.config.maxConcurrentTasks - state.runningTasks.size

    if (availableSlots <= 0 || executable.length === 0) {
      // 检查是否所有任务都已完成
      await checkCompletionStatus(swarmSessionId)

      // 如果没有可用槽位，稍后重试
      if (state.isRunning) {
        setTimeout(() => scheduleNextBatch(swarmSessionId), 1000)
      }
      return
    }

    // 获取要启动的任务
    const tasksToStart = executable.slice(0, availableSlots)

    // 并行启动任务
    await Promise.all(
      tasksToStart.map(taskId => executeTask(swarmSessionId, taskId))
    )

    // 继续调度
    if (state.isRunning) {
      setTimeout(() => scheduleNextBatch(swarmSessionId), 500)
    }
  } catch (error) {
    console.error(`[Scheduler] Error scheduling batch:`, error)
    if (state?.isRunning) {
      setTimeout(() => scheduleNextBatch(swarmSessionId), 2000)
    }
  }
}

/**
 * 执行单个任务
 */
async function executeTask(swarmSessionId: string, taskId: string): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) return

  if (state.runningTasks.has(taskId)) {
    return
  }

  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: { assignee: true },
  })

  if (!task || !task.assigneeId) {
    console.error(`[Scheduler] Task ${taskId} not found or not assigned`)
    return
  }

  const teammateBusy = Array.from(state.runningTasks.values())
    .some(info => info.teammateId === task.assigneeId && info.taskId !== taskId)

  if (teammateBusy) {
    if (!state.queuedTasks.includes(taskId)) {
      state.queuedTasks.push(taskId)
    }
    return
  }

  state.queuedTasks = state.queuedTasks.filter(id => id !== taskId)

  // 记录正在执行的任务
  const runningInfo: RunningTaskInfo = {
    taskId,
    teammateId: task.assigneeId,
    startTime: new Date(),
    retryCount: state.runningTasks.get(taskId)?.retryCount || 0,
  }
  state.runningTasks.set(taskId, runningInfo)

  // 转换任务状态
  await transitionTaskStatus(taskId, 'IN_PROGRESS', task.assigneeId)

  console.log(`[Scheduler] Starting task ${taskId} with teammate ${task.assigneeId}`)

  // 启动 teammate 执行循环（使用认知收件箱架构）
  runCognitiveTeammateLoop(swarmSessionId, task.assigneeId, taskId)
    .then(() => handleTaskCompletion(swarmSessionId, taskId, 'completed'))
    .catch(error => handleTaskCompletion(swarmSessionId, taskId, 'failed', error))
}

/**
 * 处理任务完成
 */
async function handleTaskCompletion(
  swarmSessionId: string,
  taskId: string,
  status: 'completed' | 'failed',
  error?: Error
): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) return

  const runningInfo = state.runningTasks.get(taskId)

  // 从运行列表移除
  state.runningTasks.delete(taskId)
  state.queuedTasks = state.queuedTasks.filter(id => id !== taskId)

  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: { assignee: true },
  })

  if (!task) return

  if (status === 'completed') {
    // 解锁下游任务
    await unlockDependentTasks(taskId)
    console.log(`[Scheduler] Task ${taskId} completed successfully`)
  } else {
    console.error(`[Scheduler] Task ${taskId} failed:`, error)

    // 检查是否需要重试
    const retryCount = runningInfo?.retryCount || 0

    if (state.config.retryFailedTasks && retryCount < state.config.maxRetries) {
      console.log(`[Scheduler] Retrying task ${taskId} (attempt ${retryCount + 1}/${state.config.maxRetries})`)

      // 延迟后重试
      setTimeout(() => {
        retryTask(swarmSessionId, taskId, retryCount + 1)
      }, state.config.retryDelayMs)
    } else {
      // 标记为失败
      await transitionTaskStatus(taskId, 'FAILED', task.assigneeId || '')
    }
  }

  // 触发下一轮调度
  setTimeout(() => scheduleNextBatch(swarmSessionId), 100)
}

/**
 * 重试任务
 */
async function retryTask(swarmSessionId: string, taskId: string, retryCount: number): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) return

  // 记录重试次数
  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: { assignee: true },
  })

  if (!task || !task.assigneeId) return

  // 重置为待分配状态
  await transitionTaskStatus(taskId, 'ASSIGNED', task.assigneeId)

  // 添加重试信息到上下文
  const { appendAgentContextEntry } = await import('./agent-context')
  await appendAgentContextEntry({
    swarmSessionId,
    agentId: task.assigneeId,
    sourceType: 'system',
    sourceId: null,
    entryType: 'task_retry',
    content: `任务 "${task.title}" 正在重试（第 ${retryCount} 次）`,
    metadata: { retryCount, taskId },
    visibility: 'private',
  })

  // 重新执行
  const runningInfo: RunningTaskInfo = {
    taskId,
    teammateId: task.assigneeId,
    startTime: new Date(),
    retryCount,
  }
  state.runningTasks.set(taskId, runningInfo)

  await transitionTaskStatus(taskId, 'IN_PROGRESS', task.assigneeId)

  // 重新启动执行（使用认知收件箱架构）
  runCognitiveTeammateLoop(swarmSessionId, task.assigneeId, taskId)
    .then(() => handleTaskCompletion(swarmSessionId, taskId, 'completed'))
    .catch(error => handleTaskCompletion(swarmSessionId, taskId, 'failed', error))
}

/**
 * 检查整体完成状态
 */
async function checkCompletionStatus(swarmSessionId: string): Promise<void> {
  const state = getSchedulerState(swarmSessionId)
  if (!state) return

  const tasks = await prisma.teamLeadTask.findMany({
    where: { swarmSessionId },
  })

  const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'ASSIGNED')
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS')
  const failed = tasks.filter(t => t.status === 'FAILED')
  const completed = tasks.filter(t => t.status === 'COMPLETED')

  // 如果所有任务都已完成或失败
  if (pending.length === 0 && inProgress.length === 0 && state.runningTasks.size === 0) {
    if (!state.completionAnnounced) {
      state.completionAnnounced = true
      console.log(`[Scheduler] All tasks completed. Success: ${completed.length}, Failed: ${failed.length}`)
    }

    // 可以在这里触发 Lead 的重新评估
    const session = await prisma.swarmSession.findUnique({
      where: { id: swarmSessionId },
    })

    if (session?.leadAgentId) {
      // 触发 Lead 评估
      // 这里可以通过事件或消息机制通知 Lead
    }

    await stopScheduler(swarmSessionId)
    return
  }

  state.completionAnnounced = false
}

/**
 * 手动触发任务（用于 Lead 分配后）
 */
export async function triggerTaskExecution(
  swarmSessionId: string,
  taskId: string
): Promise<void> {
  let state = getSchedulerState(swarmSessionId)

  // 如果调度器未初始化，先初始化
  if (!state) {
    state = await initScheduler(swarmSessionId)
  }

  // 检查任务是否可执行
  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: {
      dependencies: { include: { dependsOnTask: true } },
      assignee: true,
    },
  })

  if (!task || !task.assigneeId) {
    throw new Error('Task not found or not assigned')
  }

  // 检查依赖
  const depsCompleted = task.dependencies.every(d => d.dependsOnTask.status === 'COMPLETED')
  if (!depsCompleted) {
    throw new Error('Task dependencies not completed')
  }

  if (!state.queuedTasks.includes(taskId)) {
    state.queuedTasks.push(taskId)
  }

  if (!state.isRunning) {
    await startScheduler(swarmSessionId)
    return
  }

  setTimeout(() => {
    void scheduleNextBatch(swarmSessionId)
  }, 0)
}

/**
 * 获取调度器统计信息
 */
export async function getSchedulerStats(swarmSessionId: string) {
  const state = getSchedulerState(swarmSessionId)

  const tasks = await prisma.teamLeadTask.findMany({
    where: { swarmSessionId },
  })

  return {
    isRunning: state?.isRunning || false,
    config: state?.config || DEFAULT_CONFIG,
    runningCount: state?.runningTasks.size || 0,
    runningTasks: Array.from(state?.runningTasks.values() || []),
    queuedCount: state?.queuedTasks.length || 0,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'COMPLETED').length,
    failedTasks: tasks.filter(t => t.status === 'FAILED').length,
    pendingTasks: tasks.filter(t => t.status === 'PENDING').length,
    inProgressTasks: tasks.filter(t => t.status === 'IN_PROGRESS').length,
  }
}
