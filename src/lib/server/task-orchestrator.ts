import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { sendInternalMessage, createInternalThread } from '@/lib/server/internal-bus'
import { mapDbStatusToApi, serializeRealtimeTaskUpdate, serializeRealtimeAgentStatus } from '@/lib/server/swarm'
import { TeamLeadTaskStatus } from '@prisma/client'

/**
 * 任务编排器 - 处理任务依赖、状态流转和自动解锁
 */

export interface TaskStatusTransition {
  taskId: string
  fromStatus: TeamLeadTaskStatus
  toStatus: TeamLeadTaskStatus
  actorId: string // 执行状态变更的 agent ID
}

/**
 * 检查任务是否可以解锁（所有依赖都已完成）
 */
export async function checkTaskUnlockStatus(taskId: string): Promise<boolean> {
  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: {
      dependencies: {
        include: {
          dependsOnTask: true,
        },
      },
    },
  })

  if (!task) return false
  if (task.status !== 'PENDING') return false
  if (task.dependencies.length === 0) return true

  // 检查所有依赖任务是否都已完成
  return task.dependencies.every(dep =>
    dep.dependsOnTask.status === 'COMPLETED'
  )
}

/**
 * 当任务完成时，检查并解锁下游任务
 */
export async function unlockDependentTasks(completedTaskId: string) {
  const dependents = await prisma.taskDependency.findMany({
    where: { dependsOnTaskId: completedTaskId },
    include: { task: true },
  })

  const unlockedTasks = []

  for (const dep of dependents) {
    const canUnlock = await checkTaskUnlockStatus(dep.task.id)

    if (canUnlock) {
      unlockedTasks.push({
        taskId: dep.task.id,
        title: dep.task.title,
      })

      // 广播解锁事件
      publishRealtimeMessage(
        {
          type: 'task_update',
          payload: {
            task_id: dep.task.id,
            title: dep.task.title,
            status: 'pending',
            swarm_session_id: dep.task.swarmSessionId,
            message: `任务 "${dep.task.title}" 已解锁（依赖任务完成）`,
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: dep.task.swarmSessionId }
      )
    }
  }

  return unlockedTasks
}

/**
 * 任务状态流转 - 包含验证和副作用
 */
export async function transitionTaskStatus(
  taskId: string,
  newStatus: TeamLeadTaskStatus,
  actorId: string
): Promise<{
  task: Awaited<ReturnType<typeof prisma.teamLeadTask.update>>
  unlockedTasks: Array<{ taskId: string; title: string }>
  notifications: Array<{ recipientId: string; content: string }>
}> {
  const task = await prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      dependencies: { include: { dependsOnTask: true } },
      swarmSession: true,
    },
  })

  if (!task) {
    throw new Error('TASK_NOT_FOUND')
  }

  // 验证状态流转
  const validTransition = isValidStatusTransition(task.status, newStatus)
  if (!validTransition.valid) {
    throw new Error(`INVALID_STATUS_TRANSITION: ${validTransition.reason}`)
  }

  // 检查依赖是否满足
  if (newStatus === 'IN_PROGRESS') {
    const depsCompleted = task.dependencies.every(
      dep => dep.dependsOnTask.status === 'COMPLETED'
    )
    if (!depsCompleted) {
      throw new Error('DEPENDENCIES_NOT_COMPLETED')
    }
  }

  const now = new Date()

  // 更新任务
  const updatedTask = await prisma.teamLeadTask.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      startedAt: newStatus === 'IN_PROGRESS' ? task.startedAt || now : task.startedAt,
      completedAt: newStatus === 'COMPLETED' ? now : task.completedAt,
    },
    include: {
      assignee: true,
      parent: true,
      subtasks: true,
    },
  })

  const notifications: Array<{ recipientId: string; content: string }> = []

  // 如果分配给 teammate，通知他们
  if (task.assigneeId) {
    // 添加到 teammate 上下文
    await appendAgentContextEntry({
      swarmSessionId: task.swarmSessionId,
      agentId: task.assigneeId,
      sourceType: 'task',
      sourceId: taskId,
      entryType: 'task_status_change',
      content: `任务 "${task.title}" 状态变更为: ${newStatus}`,
      metadata: {
        fromStatus: task.status,
        toStatus: newStatus,
        changedBy: actorId,
      },
    })

    // 发送内部消息
    const thread = await prisma.internalThread.findFirst({
      where: { swarmSessionId: task.swarmSessionId, relatedTaskId: taskId },
    }) || await createInternalThread({
      swarmSessionId: task.swarmSessionId,
      threadType: 'task_coordination',
      subject: `任务: ${task.title}`,
      relatedTaskId: taskId,
    })

    const messageContent = getStatusChangeMessage(task.title, task.status, newStatus)
    await sendInternalMessage({
      swarmSessionId: task.swarmSessionId,
      threadId: thread.id,
      senderAgentId: actorId,
      recipientAgentId: task.assigneeId,
      messageType: 'task_status_update',
      content: messageContent,
    })

    notifications.push({
      recipientId: task.assigneeId,
      content: messageContent,
    })
  }

  // 广播状态变更
  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: serializeRealtimeTaskUpdate(updatedTask, `任务状态变更为 ${mapDbStatusToApi(newStatus)}`),
    },
    { sessionId: task.swarmSessionId }
  )

  // 如果任务完成，解锁下游任务
  let unlockedTasks: Array<{ taskId: string; title: string }> = []
  if (newStatus === 'COMPLETED') {
    unlockedTasks = await unlockDependentTasks(taskId)

    // 更新 actor (teammate) 状态为 IDLE
    await prisma.agent.update({
      where: { id: actorId },
      data: { status: 'IDLE' },
    })

    const agent = await prisma.agent.findUnique({
      where: { id: actorId },
      include: { tasks: true },
    })

    if (agent) {
      publishRealtimeMessage(
        {
          type: 'agent_status',
          payload: serializeRealtimeAgentStatus(agent),
        },
        { sessionId: task.swarmSessionId }
      )
    }
  }

  // 如果任务开始执行，更新 actor 状态为 BUSY
  if (newStatus === 'IN_PROGRESS') {
    await prisma.agent.update({
      where: { id: actorId },
      data: { status: 'BUSY' },
    })

    const agent = await prisma.agent.findUnique({
      where: { id: actorId },
      include: { tasks: true },
    })

    if (agent) {
      publishRealtimeMessage(
        {
          type: 'agent_status',
          payload: serializeRealtimeAgentStatus(agent),
        },
        { sessionId: task.swarmSessionId }
      )
    }
  }

  return { task: updatedTask, unlockedTasks, notifications }
}

/**
 * 验证状态流转是否合法
 */
function isValidStatusTransition(
  from: TeamLeadTaskStatus,
  to: TeamLeadTaskStatus
): { valid: boolean; reason?: string } {
  // 允许的状态流转
  const allowedTransitions: Record<TeamLeadTaskStatus, TeamLeadTaskStatus[]> = {
    PENDING: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'FAILED', 'CANCELLED'],
    COMPLETED: [],
    FAILED: ['PENDING', 'ASSIGNED', 'CANCELLED'],
    CANCELLED: ['PENDING'],
  }

  if (!allowedTransitions[from].includes(to)) {
    return {
      valid: false,
      reason: `Cannot transition from ${from} to ${to}. Allowed: ${allowedTransitions[from].join(', ')}`,
    }
  }

  return { valid: true }
}

/**
 * 获取状态变更消息
 */
function getStatusChangeMessage(taskTitle: string, from: TeamLeadTaskStatus, to: TeamLeadTaskStatus): string {
  const messages: Record<TeamLeadTaskStatus, string> = {
    PENDING: `任务 "${taskTitle}" 已重置为待处理状态`,
    ASSIGNED: `任务 "${taskTitle}" 已分配给你，请准备执行`,
    IN_PROGRESS: `任务 "${taskTitle}" 已开始执行`,
    COMPLETED: `任务 "${taskTitle}" 已完成，感谢你的贡献`,
    FAILED: `任务 "${taskTitle}" 执行失败，请检查并反馈`,
    CANCELLED: `任务 "${taskTitle}" 已取消`,
  }

  return messages[to] || `任务 "${taskTitle}" 状态从 ${from} 变更为 ${to}`
}

/**
 * 获取就绪任务列表（依赖已满足）
 */
export async function getReadyTasks(swarmSessionId: string) {
  const pendingTasks = await prisma.teamLeadTask.findMany({
    where: {
      swarmSessionId,
      status: 'PENDING',
    },
    include: {
      dependencies: {
        include: { dependsOnTask: true },
      },
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
  })

  return pendingTasks.filter(task =>
    task.dependencies.every(dep => dep.dependsOnTask.status === 'COMPLETED')
  )
}

/**
 * 自动分配就绪任务给空闲的 teammates
 * 返回分配结果，由 Lead 决定是否调用
 */
export async function suggestTaskAssignments(swarmSessionId: string): Promise<Array<{
  taskId: string
  taskTitle: string
  suggestedTeammates: Array<{
    agentId: string
    agentName: string
    reason: string
  }>
}>> {
  const readyTasks = await getReadyTasks(swarmSessionId)
  const idleTeammates = await prisma.agent.findMany({
    where: {
      swarmSessionId,
      status: 'IDLE',
      role: { not: 'team_lead' },
    },
  })

  return readyTasks.map(task => ({
    taskId: task.id,
    taskTitle: task.title,
    suggestedTeammates: idleTeammates.map(teammate => ({
      agentId: teammate.id,
      agentName: teammate.name,
      reason: `${teammate.name} 当前空闲`,
    })),
  }))
}
