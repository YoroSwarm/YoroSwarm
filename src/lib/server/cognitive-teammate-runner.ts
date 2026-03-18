/**
 * 认知收件箱架构 - Teammate Runner
 * 
 * 创新点：
 * 1. Teammate也有自己的"收件箱"，可以接收Lead的消息、队友的消息
 * 2. 在执行任务时，Teammate可以被打断处理更紧急的事情
 * 3. 支持协作：Teammate可以主动发消息给其他队友
 * 4. 任务完成后，通过收件箱通知Lead，而不是直接调用
 */

import type { LLMMessage, ToolDefinition } from './llm/types'
import { runAgentLoop } from './agent-loop'
import { teammateTools } from './tools/teammate-tools'
import { listAgentContextEntries } from './agent-context'
import prisma from '@/lib/db'
import { listWorkspaceFiles } from './session-workspace'
import { buildTeammateContextMessages as buildSharedTeammateContextMessages } from './llm-context'

// 认知收件箱
import {
  initCognitiveEngine,
  deliverMessage,
  getInterruptionMode,
  getMessagePlane,
  startAttentionLoop,
  updateWorkContext,
  type InboxMessage,
  type CurrentWorkContext,
} from './cognitive-inbox'

// 工具执行器（已提取到独立模块）
import {
  buildTeammateToolExecutor,
  publishStatusUpdate,
} from './teammate-tool-executor'

// 共享知识层
import { getUpstreamKnowledge, formatUpstreamKnowledge } from './shared-knowledge'

const TEAMMATE_SYSTEM_PROMPT_TEMPLATE = `你是 Swarm 团队的成员 **{{name}}**。

## 你的角色
- 角色：{{role}}
- 描述：{{description}}
{{capabilities}}

## 当前任务
{{currentTask}}

## 工作原则
1. **专注执行**：接到任务后直接开始工作，产出实际成果
2. **避免状态汇报**：不发送"正在分析""正在思考"等无实质内容的状态更新
3. **适时沟通**：
   - 遇到阻碍或需要澄清时，联系 Lead
   - 需要与其他队友协作时，直接联系相关人员
   - 任务完成后，**必须调用 report_task_completion**，未调用视为未完成
4. **可中断性**：执行任务时可能收到新消息（Lead 指示、队友求助等），根据优先级决定处理方式

## 中断与恢复
- 收到更高优先级消息时，可：
  - 使用 save_progress 保存当前进度
  - 处理新消息
  - 使用 resume_work 恢复之前的工作
- 任务应尽量连续完成，但如 Lead 明确要求处理其他事项，应优先执行

## 上下文压缩
- 系统会自动压缩旧的工具调用结果以节省上下文空间
- 标记为 [Previous: used {tool_name}] 的条目表示该工具已执行过但结果被压缩
- 如果看到 "This session is being continued from a previous conversation" 消息，说明之前的对话已被摘要压缩
- 遇到压缩后的上下文时，依据摘要和当前任务信息继续工作即可

## 工具使用说明
- **list_workspace_files**：列出工作区中的文件和目录
- **create_workspace_directory**：创建目录
- **read_workspace_file**：读取文件内容
- **create_workspace_file / replace_workspace_file**：创建或替换文件
- **report_task_completion**：任务完成后必须调用。仅当确认任务目标达成、交付完成时调用，否则继续工作或报告阻塞
- **send_message_to_lead**：向 Lead 求助或汇报问题
- **send_message_to_teammate**：与其他队友直接沟通
- **broadcast_to_team**：向全队广播重要信息
- **get_team_roster**：查看团队成员列表
- **save_progress / resume_work**：保存和恢复工作进度

## 禁止行为
- ❌ 调用工具汇报"正在分析"等状态
- ❌ 每完成一小步就发送消息
- ❌ 生成无意义的占位内容
- ❌ 为礼貌而回应 welcome/team_update 等低优先级广播
- ❌ 同一轮中反复调用 get_team_roster 或重复读取同一文件
- ❌ 无活跃任务时，因旧的 task_assignment、coordination 或完成后的补充消息而重新开始产出文档、读取文件或重复汇报
- ❌ 将中间草稿、思考过程、部分结果视为任务完成；未调用 report_task_completion 则视为未完成

## 正确做法
- ✅ 直接分析并产出结果
- ✅ 遇到实际问题时寻求帮助
- ✅ 任务完成后立即调用 report_task_completion`

interface TeammateProcessor {
  cleanup: () => void
  isTaskActive: () => boolean
  getCurrentTaskId: () => string | null
  assignTask: (taskId: string) => Promise<void>
  markTaskCompleted: () => void
  nudgeTaskExecution: () => Promise<void>
  sendMessageToTeammate: (senderId: string, content: string) => Promise<void>
  sendMessageFromLead: (content: string) => Promise<void>
}

// 存储每个Teammate的处理器
const teammateProcessors = new Map<string, TeammateProcessor>()

interface TeammateTaskRuntime {
  currentTaskId: string | null
  isTaskCompleted: boolean
  isTaskActive: boolean
  isLoopRunning: boolean
  activeTurnPromise: Promise<void> | null
  abortController: AbortController | null
}

function isNonBlockingWorkMessage(message: InboxMessage): boolean {
  return getMessagePlane(message) === 'work' && getInterruptionMode(message) === 'none'
}

async function ensureCognitiveTeammateProcessor(
  swarmSessionId: string,
  teammateId: string,
  leadAgentId: string
): Promise<TeammateProcessor> {
  const key = `${swarmSessionId}:${teammateId}`
  const existing = teammateProcessors.get(key)
  if (existing) {
    return existing
  }

  const teammate = await prisma.agent.findUnique({ where: { id: teammateId } })
  if (!teammate) {
    throw new Error(`Teammate not found: ${teammateId}`)
  }

  const taskRuntime: TeammateTaskRuntime = {
    currentTaskId: null,
    isTaskCompleted: false,
    isTaskActive: false,
    isLoopRunning: false,
    activeTurnPromise: null,
    abortController: null,
  }

  await initCognitiveEngine({
    agentId: teammateId,
    swarmSessionId,
    config: {
      batchingStrategy: 'time',
      batchTimeWindowMs: 1000,
      batchMaxCount: 2,
    },
  })

  const runSerializedTaskTurn = async (messages: InboxMessage[], context: CurrentWorkContext) => {
    // Check if aborted before starting
    if (taskRuntime.abortController?.signal.aborted || !taskRuntime.isTaskActive) {
      console.log(`[CognitiveTeammateRunner][${teammateId}] Turn aborted before start`)
      return
    }

    while (taskRuntime.activeTurnPromise) {
      await taskRuntime.activeTurnPromise
      if (taskRuntime.isTaskCompleted || !taskRuntime.isTaskActive) {
        return
      }
      if (messages.length === 0) {
        return
      }
    }

    taskRuntime.isLoopRunning = true

    let turnPromise: Promise<void> | null = null
    turnPromise = processTeammateMessages(
      swarmSessionId,
      teammateId,
      teammate,
      leadAgentId,
      messages,
      context,
      taskRuntime,
      (completed) => { taskRuntime.isTaskCompleted = completed }
    ).finally(() => {
      if (taskRuntime.activeTurnPromise === turnPromise) {
        taskRuntime.activeTurnPromise = null
      }
      taskRuntime.isLoopRunning = false
    })

    taskRuntime.activeTurnPromise = turnPromise
    await turnPromise
  }

  const cleanupAttentionLoop = await startAttentionLoop(swarmSessionId, teammateId, {
    llmConfig: {
      systemPrompt: buildTeammateSystemPrompt(teammate, null),
      agentName: teammate.name,
      tools: [...teammateTools, ...progressTools],
      executeTool: buildTeammateToolExecutor(
        swarmSessionId,
        teammateId,
        () => taskRuntime.currentTaskId,
        leadAgentId,
        teammate,
        { userId: '' },
        { getTeammateProcessor }
      ),
    },
    onProcessMessages: async (messages, context) => {
      await runSerializedTaskTurn(messages, context)
      // If abort happened during processing, throw so messages aren't marked completed
      if (taskRuntime.abortController?.signal.aborted) {
        const err = new Error('Processing aborted (session paused)')
        err.name = 'AbortError'
        throw err
      }
    },
    checkIntervalMs: 300,
  })

  const processor: TeammateProcessor = {
    cleanup: () => {
      // Abort any ongoing work immediately
      if (taskRuntime.abortController) {
        taskRuntime.abortController.abort()
      }
      taskRuntime.isTaskActive = false
      taskRuntime.isTaskCompleted = true
      cleanupAttentionLoop()
    },
    isTaskActive: () => taskRuntime.isTaskActive && !taskRuntime.isTaskCompleted,
    getCurrentTaskId: () => taskRuntime.currentTaskId,
    assignTask: async (taskId: string) => {
      taskRuntime.currentTaskId = taskId
      taskRuntime.isTaskCompleted = false
      taskRuntime.isTaskActive = true
      // Create new abort controller for this task
      taskRuntime.abortController = new AbortController()
    },
    markTaskCompleted: () => {
      taskRuntime.isTaskCompleted = true
      taskRuntime.isTaskActive = false
      taskRuntime.isLoopRunning = false
      taskRuntime.activeTurnPromise = null
      taskRuntime.currentTaskId = null
      taskRuntime.abortController = null
    },
    nudgeTaskExecution: async () => {
      if (taskRuntime.activeTurnPromise || !taskRuntime.isTaskActive || !taskRuntime.currentTaskId) {
        return
      }

      await runSerializedTaskTurn([], {
        type: 'executing_task',
        description: '继续执行当前任务',
        progress: 50,
        canBeInterrupted: true,
        estimatedTimeToComplete: 'minutes',
      })
    },
    sendMessageToTeammate: async (senderId: string, content: string) => {
      const sender = await prisma.agent.findUnique({ where: { id: senderId } })
      await deliverMessage(swarmSessionId, teammateId, {
        source: 'teammate',
        senderId,
        senderName: sender?.name || 'Teammate',
        type: 'coordination',
        content,
        swarmSessionId,
        agentId: teammateId,
      })
    },
    sendMessageFromLead: async (content: string) => {
      await deliverMessage(swarmSessionId, teammateId, {
        source: 'teammate',
        senderId: leadAgentId,
        senderName: 'Lead',
        type: 'direct_message',
        content,
        swarmSessionId,
        agentId: teammateId,
      })
    },
  }

  teammateProcessors.set(key, processor)
  return processor
}

export async function initCognitiveTeammate(
  swarmSessionId: string,
  teammateId: string,
  leadAgentId: string
): Promise<void> {
  await ensureCognitiveTeammateProcessor(swarmSessionId, teammateId, leadAgentId)
}

/**
 * 恢复 Teammate 的任务执行状态（用于会话暂停后恢复）
 *
 * 与 runCognitiveTeammateLoop 不同，此函数：
 * - 不投递初始任务消息（避免重复）
 * - 不修改任务 DB 状态（保持 IN_PROGRESS）
 * - 依赖已恢复的 inbox 消息和 heartbeat 继续执行
 */
export async function resumeTeammateTask(
  swarmSessionId: string,
  teammateId: string,
  taskId: string,
  leadAgentId: string
): Promise<void> {
  const [teammate, task] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({ where: { id: taskId }, select: { id: true, title: true } }),
  ])
  if (!teammate) {
    console.error(`[CognitiveTeammateRunner] Teammate not found for resume: ${teammateId}`)
    return
  }

  const processor = await ensureCognitiveTeammateProcessor(swarmSessionId, teammateId, leadAgentId)

  // Restore task runtime state
  await processor.assignTask(taskId)

  // Set agent to BUSY
  await prisma.agent.update({ where: { id: teammateId }, data: { status: 'BUSY' } })

  const taskInfo = { id: taskId, title: task?.title || '恢复任务' }
  publishStatusUpdate(swarmSessionId, teammate, taskInfo, 'busy')

  // Deliver a lightweight resume nudge so the attention loop has something to process
  await deliverMessage(swarmSessionId, teammateId, {
    source: 'system',
    senderId: 'system',
    senderName: '系统恢复',
    type: 'system_alert',
    content: `[会话恢复] 请继续执行你的当前任务「${taskInfo.title}」。检查之前的进度并继续工作。`,
    metadata: { taskId, sessionResumed: true },
    swarmSessionId,
    agentId: teammateId,
  })

  // Start heartbeat for continued task nudging
  const heartbeat = setInterval(() => {
    if (!processor.isTaskActive()) {
      clearInterval(heartbeat)
      return
    }
    processor.nudgeTaskExecution().catch(error => {
      console.error(`[CognitiveTeammateRunner] Failed to continue resumed task ${taskId}:`, error)
    })
  }, 1500)

  // Wait for task completion in the background (fire-and-forget)
  void (async () => {
    await waitForTaskCompletion(() => !processor.isTaskActive(), 100)
    clearInterval(heartbeat)
    console.log(`[CognitiveTeammateRunner] Resumed task completed for ${teammate.name}`)
  })()
}

/**
 * 运行认知Teammate Loop
 * 
 * 这是核心创新：Teammate有自己的收件箱，可以：
 * 1. 接收并响应Lead的消息
 * 2. 接收并响应队友的消息
 * 3. 在任务执行中被打断处理紧急事务
 */
export async function runCognitiveTeammateLoop(
  swarmSessionId: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // 获取基本信息
  const [teammate, task, session, leadAgent] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: { parent: true, subtasks: true },
    }),
    prisma.swarmSession.findUnique({ where: { id: swarmSessionId } }),
    prisma.agent.findFirst({ where: { swarmSessionId, kind: 'LEAD' } }),
  ])

  if (!teammate || !task || !session) {
    console.error(`[CognitiveTeammateRunner] Missing data`)
    return
  }

  const leadAgentId = leadAgent?.id || session.leadAgentId || ''
  const processor = await ensureCognitiveTeammateProcessor(swarmSessionId, teammateId, leadAgentId)

  const currentTaskId = processor.getCurrentTaskId()
  if (processor.isTaskActive() && currentTaskId && currentTaskId !== taskId) {
    throw new Error(`Teammate ${teammateId} is already executing task ${currentTaskId}`)
  }

  await processor.assignTask(taskId)

  // 更新状态
  await Promise.all([
    prisma.agent.update({ where: { id: teammateId }, data: { status: 'BUSY' } }),
    prisma.teamLeadTask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    }),
  ])

  // 发布状态更新
  publishStatusUpdate(swarmSessionId, teammate, task, 'busy')

  // 投递初始任务消息到收件箱
  await deliverMessage(swarmSessionId, teammateId, {
    source: 'system',
    senderId: 'system',
    senderName: 'System',
    type: 'task_assignment',
    content: `你的任务是: ${task.title}\n\n${task.description || '请根据任务标题完成工作。'}\n\n完成后请使用 report_task_completion 工具提交报告。`,
    metadata: { taskId, isInitialTask: true },
    swarmSessionId,
    agentId: teammateId,
  })

  const heartbeat = setInterval(() => {
    if (!processor.isTaskActive()) {
      clearInterval(heartbeat)
      return
    }

    processor.nudgeTaskExecution().catch(error => {
      console.error(`[CognitiveTeammateRunner] Failed to continue task ${taskId}:`, error)
    })
  }, 1500)

  // 等待任务完成（轮询检查）
  await waitForTaskCompletion(() => !processor.isTaskActive(), 100)
  clearInterval(heartbeat)

  console.log(`[CognitiveTeammateRunner] Task completed for ${teammate.name}`)
}

/**
 * 处理Teammate收件箱中的消息
 */
async function processTeammateMessages(
  swarmSessionId: string,
  teammateId: string,
  teammate: { name: string; role: string; description: string | null; capabilities: string | null },
  leadAgentId: string,
  messages: InboxMessage[],
  context: CurrentWorkContext,
  taskRuntime: TeammateTaskRuntime,
  onTaskCompleted: (completed: boolean) => void
): Promise<void> {
  // 获取 userId（用于 LLM API 配置）
  const session = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    select: { userId: true },
  })
  const userId = session?.userId
  if (taskRuntime.isTaskCompleted || !taskRuntime.isTaskActive) {
    return
  }

  const taskId = taskRuntime.currentTaskId
  const task = taskId
    ? await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
    : null

  const activeTaskId = task && task.status === 'IN_PROGRESS' ? task.id : null
  const nonBlockingMessages = messages.filter(isNonBlockingWorkMessage)
  const actionableMessages = messages.filter((message) => {
    if (isNonBlockingWorkMessage(message)) {
      return false
    }

    const messageTaskId = typeof message.metadata?.taskId === 'string' ? message.metadata.taskId : null

    if (!activeTaskId) {
      return false
    }

    if (getMessagePlane(message) !== 'control' && message.type !== 'task_assignment') {
      return false
    }

    if (!messageTaskId) {
      return true
    }

    return messageTaskId === activeTaskId
  })

  const shouldContinueActiveTask = (messages.length === 0 || nonBlockingMessages.length === messages.length) && !!activeTaskId

  if (actionableMessages.length === 0 && !shouldContinueActiveTask) {
    return
  }

  // 构建消息摘要
  const messageSummary = actionableMessages.length > 0
    ? actionableMessages.map(m => {
    const time = Math.round((Date.now() - m.receivedAt.getTime()) / 1000)
    return `[${m.type}] 来自 ${m.senderName} (${time}秒前): ${m.content.slice(0, 200)}`
    }).join('\n---\n')
    : '[system] 没有新消息。请继续推进当前活跃任务，直到产出交付物或明确报告阻塞。'

  // 获取上下文消息
  const contextMessages = await buildTeammateContextMessages(
    swarmSessionId,
    teammateId,
    taskId,
    messageSummary
  )

  // 标记所有消息为处理中
  if (actionableMessages.length > 0) {
    for (const msg of actionableMessages) {
      updateWorkContext(swarmSessionId, teammateId, {
        type: msg.type === 'task_assignment' ? 'executing_task' : 'processing_messages',
        description: `处理来自 ${msg.senderName} 的消息`,
        progress: 50,
      })
    }
  } else {
    updateWorkContext(swarmSessionId, teammateId, {
      type: 'executing_task',
      description: `继续执行任务: ${task?.title || '当前任务'}`,
      progress: 50,
    })
  }

  // 执行LLM循环
  const result = await runAgentLoop({
    systemPrompt: buildTeammateSystemPrompt(teammate, task),
    agentId: teammateId,
    agentName: teammate.name,
    swarmSessionId,
    tools: [...teammateTools, ...progressTools],
    executeTool: buildTeammateToolExecutor(
      swarmSessionId,
      teammateId,
      () => taskRuntime.currentTaskId,
      leadAgentId,
      teammate,
      { userId: userId ?? '' },
      { getTeammateProcessor }
    ),
    contextMessages,
    maxIterations: 20,
    stopOnSuccessfulTools: ['report_task_completion'],
    abortSignal: taskRuntime.abortController?.signal,
    userId,
    agentType: 'teammate',
  })

  console.log(
    `[CognitiveTeammateRunner][${teammate.name}] Processed ${actionableMessages.length} messages: ${result.iterationsUsed} iterations`
  )

  // 注意：消息完成标记已由 handleProcessNow 在 attention-manager.ts 中处理

  // 检查是否任务完成
  if (result.toolCalls?.some(tc => tc.toolName === 'report_task_completion' && tc.status === 'completed')) {
    onTaskCompleted(true)
    return
  }

  if (task && result.finalText && result.finalText.trim()) {
    console.log(
      `[CognitiveTeammateRunner][${teammate.name}] Intermediate output detected for task ${task.id}; continuing task without enqueueing protocol reminder`
    )
  }
}

/**
 * 构建Teammate系统提示
 */
function buildTeammateSystemPrompt(
  teammate: { name: string; role: string; description: string | null; capabilities: string | null },
  task: { title: string; description: string | null } | null
): string {
  const caps = teammate.capabilities
    ? (() => { try { return JSON.parse(teammate.capabilities) } catch { return [] } })()
    : []

  return TEAMMATE_SYSTEM_PROMPT_TEMPLATE
    .replace('{{name}}', teammate.name)
    .replace('{{role}}', teammate.role)
    .replace('{{description}}', teammate.description || '团队成员')
    .replace('{{capabilities}}', caps.length > 0 ? `- 能力: ${caps.join(', ')}` : '')
    .replace('{{currentTask}}', task
      ? `- 标题: ${task.title}\n- 描述: ${task.description || '无详细描述'}`
      : '- 当前没有活跃任务，请优先处理收件箱中的协调或澄清消息。')
}

async function buildTeammateContextMessages(
  swarmSessionId: string,
  teammateId: string,
  taskId: string | null,
  newMessagesSummary: string
): Promise<LLMMessage[]> {
  const entries = await listAgentContextEntries(teammateId, 20)

  const taskWithDeps = taskId
    ? await prisma.teamLeadTask.findUnique({
        where: { id: taskId },
        include: {
          dependencies: { include: { dependsOnTask: true } },
        },
      })
    : null

  const upstreamTaskIds = taskWithDeps?.dependencies.map(dep => dep.dependsOnTaskId) || []
  const workspaceFiles = await listWorkspaceFiles(swarmSessionId)

  let workspaceFileSummary: string | null = null
  if (workspaceFiles.length > 0) {
    const fileInfo = workspaceFiles
      .map(file => `- ${file.relativePath}${file.sourceTaskId === taskId ? ' - 当前任务输出' : ''}`)
      .join('\n')
    workspaceFileSummary = `[工作区文件]\n${fileInfo}\n\n如需查看目录，请使用 list_workspace_files；如需读取文件内容，请使用 read_workspace_file，并传入相对路径。若返回二进制文档错误，不得假装已阅读正文，必须向 Lead 请求可读文本。`
  }

  const upstreamFileSummaries = workspaceFiles
    .filter(file => file.sourceTaskId && upstreamTaskIds.includes(file.sourceTaskId))
    .map(file => `- 来源任务ID: ${file.sourceTaskId} | 文件: ${file.relativePath}`)

  // 从共享知识库拉取上游任务产出（Context Slicing）
  let upstreamKnowledgeText: string | null = null
  if (taskId) {
    const upstreamEntries = await getUpstreamKnowledge(swarmSessionId, taskId, {
      maxEntries: 10,
      summaryOnly: false,
    })
    upstreamKnowledgeText = formatUpstreamKnowledge(upstreamEntries)
  }

  const upstreamParts: string[] = []
  if (upstreamFileSummaries.length > 0) {
    upstreamParts.push(`[上游任务文件]\n${upstreamFileSummaries.join('\n')}`)
  }
  if (upstreamKnowledgeText) {
    upstreamParts.push(upstreamKnowledgeText)
  }

  return buildSharedTeammateContextMessages({
    contextEntries: entries,
    workspaceFileSummary,
    upstreamFileSummary: upstreamParts.length > 0 ? upstreamParts.join('\n\n') : null,
    newMessagesSummary,
    swarmSessionId,
    agentId: teammateId,
  })
}

/**
 * 进度保存/恢复工具
 */
const progressTools: ToolDefinition[] = [
  {
    name: 'save_progress',
    description: '保存当前工作进度，以便稍后恢复',
    input_schema: {
      type: 'object',
      properties: {
        progress: { type: 'number', description: '当前进度 (0-100)' },
        notes: { type: 'string', description: '进度备注' },
      },
      required: ['progress'],
    },
  },
  {
    name: 'resume_work',
    description: '恢复之前保存的工作进度',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

/**
 * 等待任务完成
 */
async function waitForTaskCompletion(
  checkFn: () => boolean,
  intervalMs: number
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (checkFn()) {
        resolve()
      } else {
        setTimeout(check, intervalMs)
      }
    }
    check()
  })
}

/**
 * 获取Teammate处理器
 */
export function getTeammateProcessor(
  swarmSessionId: string,
  teammateId: string
) {
  const key = `${swarmSessionId}:${teammateId}`
  return teammateProcessors.get(key)
}

export function cleanupCognitiveTeammate(swarmSessionId: string, teammateId: string): void {
  const key = `${swarmSessionId}:${teammateId}`
  const processor = teammateProcessors.get(key)
  if (processor) {
    processor.cleanup()
    teammateProcessors.delete(key)
    console.log(`[CognitiveTeammateRunner] Cleaned up for ${key}`)
  }
}
