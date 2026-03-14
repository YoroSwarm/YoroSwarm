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

import type { LLMMessage } from './llm/types'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { leadTools } from './tools/lead-tools'
import { listAgentContextEntries } from './agent-context'
import prisma from '@/lib/db'

// 认知收件箱
import {
  initCognitiveEngine,
  deliverMessage,
  createSnapshot,
  resumeSnapshot,
  startAttentionLoop,
  type InboxMessage,
  type CurrentWorkContext,
} from './cognitive-inbox'

// Lead编排器工具
import {
  provisionTeammate,
  decomposeTask,
  assignTaskToTeammate,
  replyToUser,
  sendToTeammate,
} from './lead-orchestrator'

const LEAD_SYSTEM_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。你的核心职责是规划、协调和决策，**绝不执行具体工作**。

## 你的工作模式

### 第一步：评估用户需求
- 分析用户请求的本质和目标
- 判断是简单问答（直接回复）还是复杂任务（需要团队协作）

### 第二步：规划与执行（仅对复杂任务）
对于需要执行的任务，按以下顺序操作：
1. **decompose_task** - 将任务拆解为可并行执行的子任务
2. **provision_teammate** - 根据子任务需求创建合适的队友
3. **assign_task** - 将子任务分配给队友
4. **reply_to_user** - 告知用户工作计划

### 第三步：监控与调整
- 队友会自主执行任务并汇报结果
- 如果队友报告失败，分析原因后决定是否重试或调整方案
- 所有任务完成后，优先基于已完成任务的 resultSummary 和上游工件直接汇总结果向用户汇报，不要再向队友索要他们刚提交过的报告
- 如果用户要求的是“完整报告/综合分析/总结性报告/完整解读”，在分项分析之外，默认还需要一个最终整合视角；不要把“若干分项已完成”等同于“最终交付已完成”

## 重要原则

### ✅ 必须做的事
- 创建子任务时考虑并行性
- 对“多方面/多角度/多维度/分别分析/主题+人物+叙事+背景”这类天然可拆分工作，优先拆成多个可并行子任务，并尽量分配给不同队友，而不是让单个队友串行承担全部维度
- 为每个子任务创建专门的队友
- 回复用户时简明扼要。对于长任务，默认只在开始时说明计划、在最终交付时汇总结果；中途只有在用户主动询问进度、任务受阻、或出现关键纠偏信息时再回复用户
- 如果团队里已经存在定义高度重合的队友，优先协调现有队友；但若只是 role 相同而职责、专长或负责维度不同，则可以继续创建新的专门化队友
- 使用 assign_task 或 send_message_to_teammate 时，teammate_id 只能使用上下文中列出的真实 ID；不要使用 41、81、teammate_0、角色别名或自己猜的短名

### ❌ 禁止做的事
- **绝不亲自写文档、代码、分析报告** - 这是队友的工作
- 不要频繁发送消息给队友询问进度
- 不要为单个简单任务创建过多队友
- 不要在已有队友可继续执行时，通过重复 provision_teammate 来规避协调成本
- 不要创建"跟进进度"、"汇报结果"、"催办"、"等待完成"之类的元任务；这些属于你自己的协调职责
- 在所有任务已经完成后，不要再向队友发送“感谢”“请确认当前状态”“保持待命”等礼貌性或确认性消息；直接向用户汇总结果即可

## 中断与恢复
- 你可能会在处理消息时被新消息打断
- 如果你正在写回复，可以使用 save_progress 保存草稿
- 处理完打断后，可以恢复之前的工作

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
  const cleanup = await startAttentionLoop(swarmSessionId, leadAgentId, {
    llmConfig: {
      systemPrompt: LEAD_SYSTEM_PROMPT,
      agentName: 'Team Lead',
      tools: leadTools,
      executeTool: buildLeadToolExecutor(input),
    },
    onProcessMessages: async (messages, context) => {
      await processInboxMessages(input, messages, context)
    },
    checkIntervalMs: 500,
  })

  // 创建处理器接口
  const processor = {
    cleanup,

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
  context: CurrentWorkContext
): Promise<void> {
  const { swarmSessionId, userId, leadAgentId } = input

  // 构建消息摘要
  const messageSummary = messages.map(m => {
    const time = Math.round((Date.now() - m.receivedAt.getTime()) / 1000)
    return `[${m.type}] 来自 ${m.senderName} (${time}秒前): ${m.content.slice(0, 200)}`
  }).join('\n---\n')

  // 获取完整上下文
  const { context: leadContext } = await getLeadOrchestrationContext(
    swarmSessionId,
    leadAgentId,
    userId
  )

  // 构建LLM消息
  const llmMessages: LLMMessage[] = [
    { role: 'user', content: `[系统提示] ${LEAD_SYSTEM_PROMPT}\n\n${buildContextPrompt(leadContext)}` },
    {
      role: 'user',
      content: `## 新消息到达

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
4. 如果需要更多时间思考，可以使用 save_progress 保存当前状态`,
    },
  ]

  // 执行LLM循环
  const result = await runAgentLoop({
    systemPrompt: LEAD_SYSTEM_PROMPT,
    agentId: leadAgentId,
    agentName: 'Team Lead',
    swarmSessionId,
    tools: leadTools,
    executeTool: buildLeadToolExecutor(input),
    contextMessages: llmMessages,
    maxIterations: 15,
  })

  console.log(
    `[CognitiveLeadRunner] Processed ${messages.length} messages: ${result.iterationsUsed} iterations`
  )

  // 注意：消息完成标记已由 handleProcessNow 在 attention-manager.ts 中处理
}

/**
 * 构建Lead工具执行器
 */
function buildLeadToolExecutor(input: LeadProcessorInput): ToolExecutor {
  const { swarmSessionId, userId, leadAgentId } = input

  return async (name: string, toolInput: Record<string, unknown>) => {
    switch (name) {
      case 'reply_to_user': {
        const result = await replyToUser(
          swarmSessionId,
          userId,
          leadAgentId,
          toolInput.content as string,
          toolInput.metadata as Record<string, unknown> | undefined
        )
        return JSON.stringify({ success: true, message_id: result.id })
      }

      case 'provision_teammate': {
        try {
          const result = await provisionTeammate(swarmSessionId, leadAgentId, {
            name: toolInput.name as string,
            role: toolInput.role as string,
            description: (toolInput.description as string) || '',
            capabilities: (toolInput.capabilities as string[]) || [],
          })
          return JSON.stringify({
            success: true,
            teammate_id: result.agent.id,
            name: result.agent.name,
            role: result.agent.role,
            status: result.agent.status,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          if (message.startsWith('TEAMMATE_DEFINITION_EXISTS:')) {
            const [, teammateId, name, role, status] = message.split(':')
            return JSON.stringify({
              success: false,
              error: 'matching_teammate_exists',
              teammate_id: teammateId,
              name,
              role,
              status,
              message: `已存在完全相同定义的队友 ${name} (${role}, ${status})，请优先复用；若只是同角色但分工不同，则允许继续创建。`,
            })
          }
          throw error
        }
      }

      case 'decompose_task': {
        const tasks = toolInput.tasks as Array<{
          title: string
          description?: string
          priority?: number
          parentId?: string
          parentTitle?: string
          dependsOnTaskIds?: string[]
          dependsOnTaskTitles?: string[]
        }>
        const result = await decomposeTask(swarmSessionId, leadAgentId, tasks)
        return JSON.stringify({
          success: true,
          tasks: result.map(t => ({ task_id: t.id, title: t.title })),
        })
      }

      case 'assign_task': {
        const taskId = toolInput.task_id as string
        const teammateId = toolInput.teammate_id as string
        // assignTaskToTeammate 已经处理了任务触发逻辑（包括依赖检查和triggerTaskExecution）
        const result = await assignTaskToTeammate(swarmSessionId, leadAgentId, taskId, teammateId)

        return JSON.stringify({
          success: true,
          task_id: result.id,
          assignee: result.assignee?.name,
        })
      }

      case 'send_message_to_teammate': {
        const result = await sendToTeammate(
          swarmSessionId,
          leadAgentId,
          toolInput.teammate_id as string,
          toolInput.content as string,
          (toolInput.message_type as string) || 'coordination'
        )
        return JSON.stringify({ success: !result.skipped, message_id: result.id, skipped: result.skipped, reason: result.reason })
      }

      case 'save_progress': {
        // 保存当前工作进度
        await createSnapshot(swarmSessionId, leadAgentId, toolInput.reason as string, {
          currentTask: {
            type: (toolInput.work_type as string) || 'general',
            description: (toolInput.description as string) || '',
            progress: (toolInput.progress as number) || 50,
            partialResult: toolInput.partial_result as string,
          },
          conversationContext: {
            messages: [],
            thinkingContent: toolInput.thinking as string,
          },
        })
        return JSON.stringify({ success: true, saved: true })
      }

      case 'resume_work': {
        // 恢复之前的工作
        const snapshot = await resumeSnapshot(swarmSessionId, leadAgentId)
        return JSON.stringify({
          success: !!snapshot,
          resumed: !!snapshot,
          previous_work: snapshot?.currentTask?.description,
        })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
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
  const [contextEntries, tasks, teammates, session, attachments] = await Promise.all([
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
  ])

  return {
    context: {
      contextEntries,
      tasks,
      teammates,
      session,
      attachments,
    },
    userId,
  }
}

/**
 * 构建上下文提示
 */
function buildContextPrompt(context: {
  contextEntries: unknown[]
  tasks: unknown[]
  teammates: unknown[]
  session: unknown
  attachments: unknown[]
}): string {
  const parts: string[] = []

  if (context.teammates.length > 0) {
    parts.push('## 团队成员')
    parts.push('以下 teammate_id 为唯一可靠标识。调用 assign_task 或 send_message_to_teammate 时，优先直接使用这些真实 ID；不要自己发明编号、缩写、teammate_0、41、81 或仅凭角色猜测。')
    parts.push('若用户请求明显包含多个独立维度或工作流，优先让不同 teammate 并行负责不同子任务；只有当任务天然串行或强依赖同一上下文时，才让单个 teammate 连续承担多个子任务。')
    for (const t of context.teammates as Array<{ id: string; name: string; role: string; status: string }>) {
      parts.push(`- **${t.name}** | ID: ${t.id} | 角色: ${t.role} | 状态: ${t.status}`)
    }
  }

  if (context.tasks.length > 0) {
    parts.push('\n## 当前任务')
    parts.push('如果你看到一组任务只是同一大任务的不同分析维度，例如主题、人物、叙事、社会背景、语言风格，默认应将这些任务视为可并行工作，优先分散给不同 teammate；不要机械地全部压给同一位 teammate。')
    for (const t of context.tasks as Array<{
      id: string
      title: string
      status: string
      resultSummary?: string | null
      assignee?: { name: string } | null
      dependencies?: Array<{ dependsOnTask: { title: string } }>
    }>) {
      const assignee = t.assignee ? `→ ${t.assignee.name}` : '未分配'
      const dependencyTitles = (t.dependencies || []).map(dep => dep.dependsOnTask.title).filter(Boolean)
      const dependencyText = dependencyTitles.length > 0 ? ` | 依赖: ${dependencyTitles.join('、')}` : ''
      const summaryText = t.resultSummary ? ` | 结果摘要: ${t.resultSummary}` : ''
      parts.push(`- [${t.status}] ${t.title} (ID: ${t.id}) ${assignee}${dependencyText}${summaryText}`)
    }
  }

  if (context.attachments.length > 0) {
    parts.push('\n## 附件文件')
    for (const f of context.attachments as Array<{ originalName: string; id: string }>) {
      parts.push(`- ${f.originalName} (ID: ${f.id})`)
    }
  }

  return parts.join('\n')
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

  console.log(`[CognitiveLeadRunner] Task completion delivered to inbox: ${completedTaskTitle}`)
}
