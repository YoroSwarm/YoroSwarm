/**
 * 认知收件箱架构 - Lead Runner
 * 
 * 创新点：
 * 1. Lead有一个"收件箱"，所有消息先进入这里
 * 2. Lead像人类一样，可以决定何时处理消息
 * 3. 支持中断/恢复：如果Lead正在写回复，Teammate来了消息，
 *    Lead可以选择"先保存草稿，处理消息，再回来继续"
 * 4. 不再有竞态条件问题，因为所有消息都通过收件箱序列化
 */

import { runAgentLoop } from './agent-loop'
import { leadTools } from './tools/lead-tools'
import { listAgentContextEntries } from './agent-context'
import { buildLeadContextMessages } from './llm-context'
import { listExternalMessages } from './external-chat'
import { buildLeadToolExecutor } from './lead-tool-executor'
import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { getLeadSelfTodoItems } from './lead-self-todo'
import { getLeadPreferences } from './lead-preferences'
import { buildLeadSkillsSection } from './skills/skill-injector'

// 认知收件箱
import {
  initCognitiveEngine,
  deliverMessage,
  startAttentionLoop,
  getCognitiveRuntime,
  type InboxMessage,
  type CurrentWorkContext,
} from './cognitive-inbox'

const LEAD_SYSTEM_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。你的核心职责是规划、协调和决策，**绝不执行具体工作**。

## 核心工作流（严格遵循此顺序）

对于任何需要团队协作的任务，你**必须**按以下步骤操作，不可跳步：

1. **update_self_todo (add)** — 立即为每个阶段/交付物创建独立的 Todo 项
2. **decompose_task** — 将任务拆解为子任务，**使用 dependsOnTaskTitles/dependsOnTaskIds 建立任务依赖关系**
3. **provision_teammate** — 为每个子任务创建专门的队友
4. **assign_task** — 将子任务分配给队友（⚠️ 这是激活队友的**唯一正确方式**）
5. **reply_to_user** — 简短告知用户工作计划

对于简单问答（不需要团队执行的），直接 reply_to_user。

## ⚠️ 关键规则：任务分配 vs 发消息

### assign_task 是激活队友执行工作的唯一方式
- 队友**只有在被 assign_task 分配任务后**才会开始工作
- 你必须先 decompose_task 创建任务，再 assign_task 将任务分配给队友
- 没有 assign_task，队友不会执行任何实质工作

### send_message_to_teammate 仅用于以下场景
- 对**已在执行任务的**队友进行补充说明、纠偏、澄清
- 发送执行控制指令（pause/resume/cancel/supersede）
- **禁止**用 send_message_to_teammate 代替 assign_task 来启动新工作
- **禁止**向没有被 assign_task 分配过任务的队友发送消息
- **禁止**在队友已完成任务后发送礼貌性、确认性、催促性消息

## Self-Todo 管理（强制执行）

Todo 是你的私有工作记忆，你**必须**在以下时机维护它：

### 必须创建 Todo 的时机
- **收到用户任务请求时**：立即为每个交付物创建 Todo（category: user_request / deliverable）
- **多阶段任务**：如"分析→报告→讲稿"，必须创建 3 个独立 Todo，不要只创建 1 个笼统的 Todo

### 必须更新 Todo 的时机
- **assign_task 之后**：将对应 Todo 标记为 in_progress
- **收到队友完成通知时**：立即将对应 Todo 标记为 completed
- **最终汇报前**：检查所有 Todo 状态，确保无遗漏
- **决定放弃某项时**：标记为 dropped

### Todo 纪律
- 上下文中的「当前 Lead Todo」板展示了你的实时待办状态，**每次回合都要核对**
- 如果 Todo 板为空但你正在处理复杂任务，说明你忘记创建了 — 立即补创
- 不要创建超过 10 个 Todo — 保持精简
- 不要创建"跟进进度""催办""等待"之类的元任务 — 这是你的协调职责，不是 Todo

## 监控与调整
- 队友会自主执行任务并汇报结果
- 队友状态中如果显示 FOCUSED 或 PROCESSING，说明**正在积极工作中**，不需要催促或发消息
- 只有当队友状态为 IDLE 且任务仍为 IN_PROGRESS 超过合理时间时，才考虑发消息跟进
- 如果队友报告失败，分析原因后决定是否重试或调整方案
- **严禁向正在 FOCUSED/PROCESSING 状态的队友发送催促消息**
- **当任务列表中所有任务状态均为 COMPLETED（无 PENDING、无 ASSIGNED、无 IN_PROGRESS）时**，用 reply_to_user **简短汇总**（200字以内）
- 如果用户要求"完整报告/综合分析"，把撰写工作分配给队友，自己绝不动手写
- 你可以在任务进行中向用户发送进度更新、重要通知或回应用户询问

## 任务依赖关系（强制执行）

**⚠️ 正确使用 dependsOnTaskTitles/dependsOnTaskIds**

某些任务**必须等待其他任务完成后才能开始**，例如：
- **报告撰写** 必须等待 **数据分析/调研** 完成
- **综合总结** 必须等待 **所有子任务** 完成
- **代码集成** 必须等待 **各模块开发** 完成
- **验证/审核** 必须等待 **被审核内容** 完成

在 decompose_task 时：
- 使用 dependsOnTaskTitles（同批次任务）或 dependsOnTaskIds（已存在任务）**显式声明依赖关系**
- **禁止**只在描述中用文字暗示依赖关系（如"等待XX完成后再做"） — 必须使用字段声明
- 有依赖的任务在被分配后，会等待其依赖任务完成后才开始执行

## 任务完成检查（强制执行）
在每次处理消息后，你**必须**检查任务列表：
1. 如果有 PENDING 且未分配的任务 → 立即创建队友并分配
2. 如果有 ASSIGNED/IN_PROGRESS 的任务 → 继续等待，不要回复用户
3. 如果迭代次数不足以完成所有分配，**优先完成任务分配**，回复用户可以推迟
4. 只有当所有任务都是 COMPLETED 或 CANCELLED 状态时，才能调用 reply_to_user 进行最终汇总

## 重要原则

### ✅ 必须做的事
- 创建子任务时考虑并行性
- 对多方面/多维度工作，优先拆成多个可并行子任务分配给不同队友
- 为每个子任务创建专门的队友
- 回复用户时简明扼要。中途仅在用户询问、任务受阻时回复
- 使用 assign_task 或 send_message_to_teammate 时，teammate_id 只能使用上下文中列出的真实 ID

### ❌ 禁止做的事（违反即失败）
- **绝不亲自写文档、代码、分析报告** — 超过 200 字的内容输出必须由队友完成
- **绝不在 reply_to_user 中复述队友的完整分析** — 只说"XX队友已完成分析，报告见文件 XX.md"
- 回复长度不超过 300 字
- **绝不用 send_message_to_teammate 启动新工作** — 必须用 assign_task
- 不要频繁发消息询问进度
- 不要为单个简单任务创建过多队友
- 不要在任务完成后向队友发送感谢/确认/待命消息

## 中断与恢复
- 你可能会在处理消息时被新消息打断
- 如果你正在写回复，可以使用 save_progress 保存草稿
- 处理完打断后，可以恢复之前的工作

## 上下文压缩
- 系统会自动压缩旧的对话历史以节省上下文空间
- 标记为 [Previous: used {tool_name}] 的条目是已执行但内容被压缩的工具调用
- 如果你看到以 "This session is being continued from a previous conversation" 开头的消息，说明之前的对话已被摘要压缩
- 遇到上下文压缩时，优先依据摘要和当前状态信息继续工作

## 收件箱处理
- 多条消息可能同时到达
- 评估消息的优先级和紧急程度
- 可以批量处理相关消息
- 高优先级消息（如用户直接提问）应立即处理`

// 内存中存储每个Lead的处理器
const leadProcessors = new Map<string, {
  cleanup: () => void
  processUserMessage: (content: string, attachments?: unknown[]) => Promise<void>
  processTeammateMessage: (teammateId: string, content: string, taskId?: string) => Promise<void>
  processTaskCompletion: (teammateId: string, taskId: string, report: string) => Promise<void>
  abortController: AbortController
}>()

interface LeadProcessorInput {
  swarmSessionId: string
  userId: string
  leadAgentId: string
}

/**
 * 初始化Lead的认知处理器
 *
 * 这是核心创新：每个Lead有自己的"认知收件箱"和"注意力循环"
 */
export async function initCognitiveLead(input: LeadProcessorInput): Promise<void> {
  const { swarmSessionId, userId, leadAgentId } = input
  const key = `${swarmSessionId}:${leadAgentId}`

  // 验证 Lead Agent 是否存在于数据库中
  const leadAgent = await prisma.agent.findUnique({ where: { id: leadAgentId } })
  if (!leadAgent) {
    throw new Error(`Lead agent not found: ${leadAgentId}. Cannot initialize cognitive lead processor.`)
  }

  // 如果已经初始化，先清理
  if (leadProcessors.has(key)) {
    const existing = leadProcessors.get(key)!
    existing.cleanup()
    leadProcessors.delete(key)
  }

  // 创建中止控制器用于强制停止
  const abortController = new AbortController()

  // 初始化认知引擎
  await initCognitiveEngine({
    agentId: leadAgentId,
    swarmSessionId,
    config: {
      batchingStrategy: 'smart',
      batchTimeWindowMs: 2000, // 2秒批处理窗口
      batchMaxCount: 3,
    },
  })

  // 启动注意力循环
  const cleanupAttentionLoop = await startAttentionLoop(swarmSessionId, leadAgentId, {
    userId,
    llmConfig: {
      systemPrompt: LEAD_SYSTEM_PROMPT,
      agentName: 'Team Lead',
      tools: leadTools,
      executeTool: buildLeadToolExecutor(input),
    },
    onProcessMessages: async (messages, context) => {
      // Note: preferences 在消息处理时动态获取（见 processInboxMessages）
      await processInboxMessages(input, messages, context, abortController.signal)
      // If abort happened during processing, throw so messages aren't marked completed
      if (abortController.signal.aborted) {
        const err = new Error('Processing aborted (session paused)')
        err.name = 'AbortError'
        throw err
      }
    },
    checkIntervalMs: 500,
  })

  // 创建处理器接口
  const processor = {
    cleanup: () => {
      abortController.abort()
      cleanupAttentionLoop()
    },
    abortController,

    /**
     * 处理用户消息 - 投递到收件箱
     */
    processUserMessage: async (content: string, attachments?: unknown[]) => {
      await deliverMessage(swarmSessionId, leadAgentId, {
        source: 'user',
        senderId: userId,
        senderName: 'User',
        type: 'direct_message',
        content,
        metadata: { attachments },
        swarmSessionId,
        agentId: leadAgentId,
      })
    },

    /**
     * 处理Teammate消息 - 投递到收件箱
     */
    processTeammateMessage: async (teammateId: string, content: string, taskId?: string) => {
      const teammate = await prisma.agent.findUnique({ where: { id: teammateId } })
      
      await deliverMessage(swarmSessionId, leadAgentId, {
        source: 'teammate',
        senderId: teammateId,
        senderName: teammate?.name || 'Teammate',
        type: 'direct_message',
        content,
        metadata: { taskId },
        swarmSessionId,
        agentId: leadAgentId,
      })
    },

    /**
     * 处理任务完成 - 投递到收件箱
     */
    processTaskCompletion: async (teammateId: string, taskId: string, report: string) => {
      const [teammate, task] = await Promise.all([
        prisma.agent.findUnique({ where: { id: teammateId } }),
        prisma.teamLeadTask.findUnique({ where: { id: taskId } }),
      ])

      await deliverMessage(swarmSessionId, leadAgentId, {
        source: 'teammate',
        senderId: teammateId,
        senderName: teammate?.name || 'Teammate',
        type: 'task_complete',
        content: `[任务完成] ${task?.title || '任务'}\n\n汇报:\n${report}`,
        metadata: { taskId, report },
        swarmSessionId,
        agentId: leadAgentId,
      })
    },
  }

  leadProcessors.set(key, processor)
  console.log(`[CognitiveLeadRunner] Initialized for ${key}`)
}

/**
 * 获取Lead处理器
 */
export function getCognitiveLeadProcessor(
  swarmSessionId: string,
  leadAgentId: string
) {
  const key = `${swarmSessionId}:${leadAgentId}`
  return leadProcessors.get(key)
}

/**
 * 清理Lead处理器
 */
export function cleanupCognitiveLead(swarmSessionId: string, leadAgentId: string): void {
  const key = `${swarmSessionId}:${leadAgentId}`
  const processor = leadProcessors.get(key)
  if (processor) {
    processor.cleanup()
    leadProcessors.delete(key)
    console.log(`[CognitiveLeadRunner] Cleaned up for ${key}`)
  }
}

/**
 * 处理收件箱中的消息
 *
 * 这是核心处理逻辑：Lead看到消息，决定如何响应
 */
async function processInboxMessages(
  input: LeadProcessorInput,
  messages: InboxMessage[],
  context: CurrentWorkContext,
  abortSignal?: AbortSignal
): Promise<void> {
  const { swarmSessionId, userId, leadAgentId } = input

  // 从数据库获取用户 Lead 配置和 Skills 目录
  const [preferences, skillsSection] = await Promise.all([
    getLeadPreferences(userId),
    buildLeadSkillsSection(userId),
  ])

  // 构建消息摘要
  const messageSummary = messages.map(m => {
    const time = Math.round((Date.now() - m.receivedAt.getTime()) / 1000)
    return `[${m.type}] 来自 ${m.senderName} (${time}秒前): ${m.content.slice(0, 200)}`
  }).join('\n---\n')

  // 获取完整上下文（包括 Lead 自身的历史对话记录）
  const [
    { context: leadContext },
    externalChat,
  ] = await Promise.all([
    getLeadOrchestrationContext(swarmSessionId, leadAgentId, userId),
    listExternalMessages(swarmSessionId, userId),
  ])

  // 构建当前收件箱消息提示
  const currentUserMessage = `## 新消息到达

当前工作状态：${context.type} (${context.progress}% 完成)
${context.description}

---

你需要处理以下消息：

${messageSummary}

---

请决定如何响应。你可以选择：
1. 使用 reply_to_user 回复用户
2. 使用 send_message_to_teammate 回复队友
3. 使用 provision_teammate / decompose_task / assign_task 执行管理任务
4. 如果需要更多时间思考，可以使用 save_progress 保存当前状态`

  // 使用共享的上下文构建器，正确重建对话历史（含工具调用/结果）
  const llmMessages = await buildLeadContextMessages({
    teammates: leadContext.teammates.map(t => {
      // Enrich with cognitive runtime state so Lead sees real working status
      const runtime = getCognitiveRuntime(swarmSessionId, t.id)
      let enrichedStatus = t.status as string
      if (runtime) {
        const cogState = runtime.currentState
        const progress = runtime.currentWorkContext?.progress
        const desc = runtime.currentWorkContext?.description
        const eta = runtime.currentWorkContext?.estimatedTimeToComplete
        if (cogState === 'FOCUSED' || cogState === 'PROCESSING') {
          enrichedStatus = `${t.status} (${cogState}`
          if (typeof progress === 'number' && progress > 0) enrichedStatus += `, ${progress}%完成`
          if (eta) enrichedStatus += `, 预计${eta}`
          enrichedStatus += ')'
          if (desc) enrichedStatus += ` - ${desc.slice(0, 100)}`
        } else if (cogState !== 'IDLE') {
          enrichedStatus = `${t.status} (${cogState})`
        }
      }
      return {
        id: t.id,
        name: t.name,
        role: t.role,
        status: enrichedStatus,
        capabilities: t.capabilities,
      }
    }),
    tasks: leadContext.tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      description: t.description,
      resultSummary: t.resultSummary,
      errorSummary: t.errorSummary,
      assignee: t.assignee ? { name: t.assignee.name } : null,
    })),
    attachments: leadContext.attachments.map(f => ({
      fileId: f.id,
      fileName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
    })),
    contextEntries: leadContext.contextEntries.map(e => ({
      entryType: e.entryType,
      content: e.content,
      metadata: e.metadata,
    })),
    externalMessages: externalChat.messages.map(m => ({
      senderType: m.senderType,
      content: m.content,
    })),
    selfTodos: leadContext.selfTodos?.map(t => ({
      id: t.id,
      title: t.title,
      details: t.details,
      status: t.status,
      category: t.category,
      sourceRef: t.sourceRef,
      updatedAt: t.updatedAt,
    })),
    currentUserMessage,
    swarmSessionId,
    agentId: leadAgentId,
    userId,
    preferences: preferences ? {
      agentsMd: preferences.agentsMd ?? undefined,
      soulMd: preferences.soulMd ?? undefined,
    } : undefined,
    skillsSection,
  })

  // 动态计算 maxIterations：大任务集需要更多迭代空间
  const taskCount = leadContext.tasks.length
  const dynamicMaxIterations = Math.max(15, Math.min(taskCount * 2, 50))

  // 执行LLM循环
  const communicationToolCounts = new Map<string, number>()
  const result = await runAgentLoop({
    systemPrompt: LEAD_SYSTEM_PROMPT,
    agentId: leadAgentId,
    agentName: 'Team Lead',
    swarmSessionId,
    tools: leadTools,
    executeTool: buildLeadToolExecutor(input),
    contextMessages: llmMessages,
    maxIterations: dynamicMaxIterations,
    abortSignal,
    userId,
    agentType: 'lead',
    shouldStopAfterToolCall: ({ toolName, isError }) => {
      if (isError) return false
      // Track repeated communication tool calls to the same peer
      if (toolName === 'send_message_to_teammate' || toolName === 'reply_to_user') {
        const count = (communicationToolCounts.get(toolName) || 0) + 1
        communicationToolCounts.set(toolName, count)
        // Allow up to 3 communication calls per iteration batch, then stop
        if (count >= 3) {
          console.log(`[CognitiveLeadRunner] Stopping loop: ${toolName} called ${count} times`)
          return true
        }
      }
      return false
    },
  })

  console.log(
    `[CognitiveLeadRunner] Processed ${messages.length} messages: ${result.iterationsUsed}/${dynamicMaxIterations} iterations`
  )

  // Post-loop 自检：如果还有 PENDING 未分配的任务，自动注入提醒消息
  await checkAndNotifyPendingTasks(swarmSessionId, leadAgentId)
}

/**
 * Post-loop 自检：检查是否有 PENDING 未分配的任务
 * 如果有，自动向 Lead 收件箱注入提醒消息
 * 
 * 防止堆叠：如果收件箱已有自检消息，则跳过注入
 */
async function checkAndNotifyPendingTasks(
  swarmSessionId: string,
  leadAgentId: string
): Promise<void> {
  // Check if there's already a self-check message pending in the inbox
  const runtime = getCognitiveRuntime(swarmSessionId, leadAgentId)
  if (runtime) {
    const hasPendingSelfCheck = runtime.inbox.pending.some(
      m => m.metadata && typeof m.metadata === 'object' &&
        ((m.metadata as Record<string, unknown>).periodicSelfCheck === true ||
         (m.metadata as Record<string, unknown>).pendingTaskCount !== undefined)
    )
    if (hasPendingSelfCheck) {
      return // Already has a self-check message queued, skip to avoid stacking
    }
  }

  const pendingUnassigned = await prisma.teamLeadTask.findMany({
    where: {
      swarmSessionId,
      status: 'PENDING',
      assigneeId: null,
    },
    select: { id: true, title: true },
  })

  if (pendingUnassigned.length === 0) return

  const taskList = pendingUnassigned
    .map(t => `- ${t.title} (ID: ${t.id})`)
    .join('\n')

  console.log(
    `[CognitiveLeadRunner] Post-loop check: ${pendingUnassigned.length} PENDING unassigned tasks found, injecting reminder`
  )

  try {
    await deliverMessage(swarmSessionId, leadAgentId, {
      source: 'system',
      senderId: 'system',
      senderName: '系统自检',
      type: 'system_alert',
      content: `[任务自检提醒] 你还有 ${pendingUnassigned.length} 个任务处于 PENDING 状态且未分配给任何队友：\n\n${taskList}\n\n请立即为这些任务创建队友并分配。在所有任务都被分配之前，不要调用 reply_to_user。`,
      priority: 'high',
      metadata: {
        autoGenerated: true,
        pendingTaskCount: pendingUnassigned.length,
        pendingTaskIds: pendingUnassigned.map(t => t.id),
      },
      swarmSessionId,
      agentId: leadAgentId,
    })
  } catch (err) {
    console.error(`[CognitiveLeadRunner] Failed to inject pending task reminder:`, err)
  }
}

/**
 * 获取Lead编排上下文
 */
async function getLeadOrchestrationContext(
  swarmSessionId: string,
  leadAgentId: string,
  userId: string
) {
  const [contextEntries, tasks, teammates, session, attachments, selfTodos] = await Promise.all([
    listAgentContextEntries(leadAgentId, 50),
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId },
      include: { assignee: true, subtasks: true, dependencies: { include: { dependsOnTask: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.findMany({
      where: { swarmSessionId, status: { not: 'OFFLINE' } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.swarmSession.findUnique({ where: { id: swarmSessionId } }),
    prisma.file.findMany({
      where: { swarmSessionId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    getLeadSelfTodoItems(leadAgentId),
  ])

  return {
    context: {
      contextEntries,
      tasks,
      teammates,
      session,
      attachments,
      selfTodos,
    },
    userId,
  }
}

/**
 * 外部调用入口：用户发送消息
 */
export async function runCognitiveLeadLoop(input: {
  swarmSessionId: string
  userId: string
  leadAgentId: string
  userMessage: string
  attachments?: Array<{
    fileId: string
    fileName: string
    mimeType: string
  }>
}): Promise<void> {
  const { swarmSessionId, userId, leadAgentId, userMessage, attachments } = input

  // 验证 leadAgentId 不为空
  if (!leadAgentId) {
    throw new Error('leadAgentId is required')
  }

  console.log(`[CognitiveLeadRunner] Starting loop with leadAgentId: ${leadAgentId}`)

  // 再次验证 Lead Agent 在数据库中存在（用于调试）
  const leadAgentCheck = await prisma.agent.findUnique({ where: { id: leadAgentId } })
  console.log(`[CognitiveLeadRunner] Lead agent check:`, leadAgentCheck ? `Found ${leadAgentCheck.name}` : 'NOT FOUND')

  // 确保Lead处理器已初始化
  let processor = getCognitiveLeadProcessor(swarmSessionId, leadAgentId)
  if (!processor) {
    console.log(`[CognitiveLeadRunner] Processor not found, initializing...`)
    try {
      await initCognitiveLead({ swarmSessionId, userId, leadAgentId })
    } catch (initError) {
      console.error(`[CognitiveLeadRunner] Failed to initialize lead processor:`, initError)
      throw new Error(`Failed to initialize lead: ${initError instanceof Error ? initError.message : 'Unknown error'}`)
    }
    processor = getCognitiveLeadProcessor(swarmSessionId, leadAgentId)
    if (!processor) {
      throw new Error('Lead processor initialization succeeded but processor not found')
    }
  }

  // 投递用户消息到收件箱
  await processor.processUserMessage(userMessage, attachments)

  // 立即通知前端 Lead 进入 busy 状态（AttentionManager 决策期间也算忙碌）
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: leadAgentId,
        name: leadAgentCheck?.name || 'Team Lead',
        status: 'busy',
        swarm_session_id: swarmSessionId,
      },
    },
    { sessionId: swarmSessionId }
  )

  console.log(`[CognitiveLeadRunner] User message delivered to inbox`)
}

/**
 * 外部调用入口：处理Teammate任务完成
 */
export async function runCognitiveLeadReEvaluation(
  swarmSessionId: string,
  leadAgentId: string,
  userId: string,
  completedTaskTitle: string,
  completedReport: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // 确保Lead处理器已初始化
  let processor = getCognitiveLeadProcessor(swarmSessionId, leadAgentId)
  if (!processor) {
    await initCognitiveLead({ swarmSessionId, userId, leadAgentId })
    processor = getCognitiveLeadProcessor(swarmSessionId, leadAgentId)!
  }

  // 投递任务完成消息到收件箱
  await processor.processTaskCompletion(teammateId, taskId, completedReport)

  // 立即通知前端 Lead 进入 busy 状态
  const leadAgent = await prisma.agent.findUnique({ where: { id: leadAgentId }, select: { name: true } })
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: leadAgentId,
        name: leadAgent?.name || 'Team Lead',
        status: 'busy',
        swarm_session_id: swarmSessionId,
      },
    },
    { sessionId: swarmSessionId }
  )

  console.log(`[CognitiveLeadRunner] Task completion delivered to inbox: ${completedTaskTitle}`)
}
