import prisma from '@/lib/db'
import { createTeammate, type CreateTeammateInput } from '@/lib/server/teammate-factory'
import { appendAgentContextEntry, listAgentContextEntries } from '@/lib/server/agent-context'
import { createInternalThread, sendInternalMessage, initializeTeamAwareness, resolveAgentInSession } from '@/lib/server/internal-bus'
import { appendLeadReply, getSessionAttachments } from '@/lib/server/external-chat'
import { listExternalMessages } from '@/lib/server/external-chat'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { getLeadSelfTodoItems } from './lead-self-todo'
import { decomposeTask, assignTaskToTeammate, handleTeammateReport } from './lead-orchestrator-tasks'
import { callLLM, extractTextContent } from './llm/client'

export { decomposeTask, assignTaskToTeammate, handleTeammateReport }

export function buildLeadToTeammateRuntimeControl(messageType: string, options: {
  taskId?: string
  queuedBehindTaskId?: string | null
  hasPendingDependencies?: boolean
}) {
  const workUnitKey = options.taskId ? `task:${options.taskId}` : undefined

  if (messageType === 'task_assignment') {
    return {
      plane: 'work',
      interruption: options.hasPendingDependencies ? 'none' : 'soft',
      workUnitKey,
      supersedesPending: true,
    }
  }

  if (messageType === 'question' || messageType === 'clarification_request') {
    return {
      plane: 'control',
      interruption: 'soft',
      workUnitKey,
      supersedesPending: true,
    }
  }

  if (messageType === 'urgent') {
    return {
      plane: 'control',
      interruption: 'hard',
      workUnitKey,
    }
  }

  if (messageType === 'pause_execution' || messageType === 'resume_execution' || messageType === 'cancel_execution' || messageType === 'supersede_execution') {
    return {
      plane: 'control',
      interruption: 'hard',
      workUnitKey,
      supersedesPending: true,
      controlType: messageType,
    }
  }

  return {
    plane: 'control',
    interruption: 'soft',
    workUnitKey,
    supersedesPending: true,
  }
}


/**
 * Lead 编排器 - 由 LLM 驱动决策
 * 系统只提供工具，所有策略决策交给 Lead (LLM)
 */

export interface OrchestrateInput {
  swarmSessionId: string
  userId: string
  leadAgentId: string
  userMessage: string
  attachments?: Array<{
    fileId: string
    fileName: string
    mimeType: string
  }>
}

type SendToTeammateResult = {
  id: string
  skipped?: boolean
  reason?: string
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeCapabilities(value: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : []

  return Array.from(new Set(raw.map(item => normalizeComparableText(item)).filter(Boolean))).sort()
}

function isSameTeammateDefinition(
  existing: { name: string; role: string; description: string | null; capabilities: string | null },
  requested: { name: string; role: string; description: string; capabilities: string[] }
): boolean {
  const sameRole = normalizeComparableText(existing.role) === normalizeComparableText(requested.role)
  if (!sameRole) return false

  const sameName = normalizeComparableText(existing.name) === normalizeComparableText(requested.name)
  if (sameName) return true

  const sameDescription = normalizeComparableText(existing.description) === normalizeComparableText(requested.description)
  const existingCapabilities = normalizeCapabilities(existing.capabilities)
  const requestedCapabilities = normalizeCapabilities(requested.capabilities)
  const sameCapabilities = existingCapabilities.length === requestedCapabilities.length
    && existingCapabilities.every((capability, index) => capability === requestedCapabilities[index])

  return sameDescription && sameCapabilities
}

function isCeremonialCompletionMessage(content: string): boolean {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return /感谢|谢谢|辛苦了|请确认|确认当前工作状态|确认状态|保持待命|任务顺利结束|所有任务已完成|当前无进行中的工作|继续等待|请等待|等待其他队友|收到任务完成通知|收到完成通知|收到任务完成|all tasks (are )?complete|confirm (your )?(current )?status|wait for (the )?other teammates|thanks|thank you/i.test(normalized)
}

async function shouldSkipLeadTeammateMessage(input: {
  swarmSessionId: string
  teammateId: string
  content: string
  messageType: string
  leadAgentId?: string
}): Promise<{ skipped: boolean; reason?: string }> {
  if (input.messageType !== 'coordination') {
    return { skipped: false }
  }

  const normalized = input.content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return { skipped: true, reason: 'empty_coordination_message' }
  }

  // Rate limit: no more than 5 messages to the same teammate within 60 seconds
  if (input.leadAgentId) {
    const recentCount = await prisma.internalMessage.count({
      where: {
        swarmSessionId: input.swarmSessionId,
        senderAgentId: input.leadAgentId,
        recipientAgentId: input.teammateId,
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    })
    if (recentCount >= 5) {
      return { skipped: true, reason: 'rate_limited_5_per_60s' }
    }
  }

  const [tasks, teammateTasks] = await Promise.all([
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId: input.swarmSessionId },
      select: { status: true },
    }),
    prisma.teamLeadTask.findMany({
      where: {
        swarmSessionId: input.swarmSessionId,
        assigneeId: input.teammateId,
      },
      select: { status: true },
    }),
  ])

  const hasActiveTasks = tasks.some(task => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status))
  const teammateHasActiveTask = teammateTasks.some(task => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status))
  const ceremonial = isCeremonialCompletionMessage(normalized)

  if (!teammateHasActiveTask && ceremonial) {
    return { skipped: true, reason: 'completed_teammate_ceremonial_message' }
  }

  if (!hasActiveTasks && ceremonial) {
    return { skipped: true, reason: 'all_tasks_completed' }
  }

  return { skipped: false }
}

/**
 * 获取 Lead 的完整上下文（包括历史消息、任务状态、teammates 状态、附件）
 */
export async function getLeadContext(swarmSessionId: string, leadAgentId: string, userId: string) {
  const [contextEntries, tasks, teammates, session, attachments, externalChat, selfTodos] = await Promise.all([
    listAgentContextEntries(leadAgentId, 50),
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId },
      include: { assignee: true, subtasks: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.findMany({
      where: { swarmSessionId, status: { not: 'OFFLINE' } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.swarmSession.findUnique({
      where: { id: swarmSessionId },
    }),
    getSessionAttachments(swarmSessionId),
    listExternalMessages(swarmSessionId, userId),
    getLeadSelfTodoItems(leadAgentId),
  ])

  return {
    contextEntries,
    tasks,
    teammates,
    session,
    attachments,
    externalMessages: externalChat.messages,
    selfTodos,
  }
}

/**
 * Lead 创建 teammate 的工具函数
 * 创建后初始化团队感知，让新队友了解现有团队成员
 */
export async function provisionTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  definition: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>
) {
  const existingCandidates = await prisma.agent.findMany({
    where: {
      swarmSessionId,
      id: { not: leadAgentId },
      status: { not: 'OFFLINE' },
    },
    select: { id: true, name: true, role: true, status: true, description: true, capabilities: true },
  })
  const existingMatch = existingCandidates.find(agent => isSameTeammateDefinition(agent, {
    name: definition.name,
    role: definition.role,
    description: definition.description,
    capabilities: definition.capabilities,
  }))

  if (existingMatch) {
    return {
      agent: {
        id: existingMatch.id,
        name: existingMatch.name,
        role: existingMatch.role,
        status: existingMatch.status,
        description: existingMatch.description,
        capabilities: existingMatch.capabilities,
      },
      teamAwareness: null,
      reusedExisting: true,
    }
  }

  // 创建队友
  const result = await createTeammate({
    ...definition,
    swarmSessionId,
    createdById: leadAgentId,
  })

  // 初始化团队感知 - 让新队友了解现有团队成员
  const awareness = await initializeTeamAwareness({
    swarmSessionId,
    newAgentId: result.agent.id,
    leadAgentId,
  })

  console.log(
    `[LeadOrchestrator] Created teammate ${result.agent.name}, initialized team awareness: ${awareness.hasExistingTeammates ? awareness.teammateCount : 0} existing teammates`
  )

  return {
    ...result,
    teamAwareness: awareness,
    reusedExisting: false,
  }
}

/**
 * Auto-rename session based on conversation content.
 * Fires asynchronously after Lead's first reply — does not block response delivery.
 */
async function maybeAutoRenameSession(swarmSessionId: string) {
  try {
    const session = await prisma.swarmSession.findUnique({
      where: { id: swarmSessionId },
      select: { title: true },
    })
    if (!session || !session.title.startsWith('新对话')) return

    // Grab first few user + lead messages for context
    const conversation = await prisma.externalConversation.findFirst({
      where: { swarmSessionId },
      select: { id: true },
    })
    if (!conversation) return

    const messages = await prisma.externalMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: { senderType: true, content: true },
    })
    if (messages.length === 0) return

    const transcript = messages
      .map((m) => `${m.senderType === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const response = await callLLM({
      systemPrompt:
        'Generate a concise session title (max 20 characters, Chinese preferred) summarizing the conversation topic. Reply with ONLY the title text, no quotes or explanation.',
      messages: [
        {
          role: 'user',
          content: `Based on this conversation, generate a short title:\n\n${transcript}`,
        },
      ],
      maxTokens: 60,
      usageContext: { swarmSessionId, requestKind: 'auto_rename' },
    })

    const title = extractTextContent(response).trim().replace(/^["'""]+|["'""]+$/g, '')
    if (!title || title.length > 50) return

    await prisma.swarmSession.update({
      where: { id: swarmSessionId },
      data: { title },
    })

    publishRealtimeMessage(
      {
        type: 'session_updated',
        payload: {
          swarm_session_id: swarmSessionId,
          title,
        },
      },
      { sessionId: swarmSessionId }
    )
  } catch (err) {
    console.error('[AutoRename] Failed to auto-rename session:', err)
  }
}

/**
 * Lead 向用户回复的工具函数
 */
export async function replyToUser(
  swarmSessionId: string,
  userId: string,
  leadAgentId: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  const normalizedContent = content.trim().replace(/\s+/g, ' ')
  const conversation = await prisma.externalConversation.findFirst({
    where: { swarmSessionId, userId },
    select: { id: true },
  })

  if (conversation && normalizedContent) {
    const recentLeadReplies = await prisma.externalMessage.findMany({
      where: {
        conversationId: conversation.id,
        senderType: 'lead',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const requestedReplyKey = typeof metadata?.replyKey === 'string' && metadata.replyKey.trim()
      ? metadata.replyKey.trim()
      : null

    for (const existingReply of recentLeadReplies) {
      if (requestedReplyKey && existingReply.metadata) {
        try {
          const parsedMetadata = JSON.parse(existingReply.metadata) as Record<string, unknown>
          if (parsedMetadata.replyKey === requestedReplyKey) {
            return existingReply
          }
        } catch {
          // Ignore malformed historical metadata and continue dedupe checks.
        }
      }

      const normalizedLatest = existingReply.content.trim().replace(/\s+/g, ' ')
      const isDuplicateContent = normalizedLatest === normalizedContent
      const isRecent = Date.now() - existingReply.createdAt.getTime() < 120_000
      if (isDuplicateContent && isRecent) {
        return existingReply
      }
    }
  }

  const reply = await appendLeadReply({
    swarmSessionId,
    userId,
    leadAgentId,
    content,
    metadata,
  })

  // 广播到 WebSocket
  const wsAttachments = metadata?.attachments as Array<{ fileId: string; fileName: string; mimeType: string }> | undefined
  publishRealtimeMessage(
    {
      type: 'chat_message',
      payload: {
        id: reply.id,
        swarm_session_id: swarmSessionId,
        sender_type: 'lead',
        sender_id: leadAgentId,
        sender_name: 'Lead',
        content,
        message_type: 'text',
        metadata: wsAttachments ? { attachments: wsAttachments } : undefined,
        created_at: reply.createdAt.toISOString(),
        timestamp: reply.createdAt.toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // Fire-and-forget: auto-rename session if it still has the default title
  void maybeAutoRenameSession(swarmSessionId)

  return reply
}

/**
 * Lead 向 teammate 发送内部消息的工具函数
 */
export async function sendToTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  teammateId: string,
  content: string,
  messageType: string = 'coordination'
): Promise<SendToTeammateResult> {
  // 验证发送者和接收者都存在
  const [leadAgent, teammate] = await Promise.all([
    prisma.agent.findUnique({ where: { id: leadAgentId } }),
    resolveAgentInSession(swarmSessionId, teammateId, { excludeAgentIds: [leadAgentId] }),
  ])

  if (!leadAgent) {
    throw new Error(`Lead agent not found: ${leadAgentId}`)
  }
  if (!teammate) {
    throw new Error(`Teammate not found: ${teammateId}`)
  }

  const skipDecision = await shouldSkipLeadTeammateMessage({
    swarmSessionId,
    teammateId: teammate.id,
    content,
    messageType,
    leadAgentId,
  })
  if (skipDecision.skipped) {
    console.log(`[LeadOrchestrator] Skipping teammate message: ${skipDecision.reason}`)
    return {
      id: 'noop',
      skipped: true,
      reason: skipDecision.reason,
    }
  }

  // 查找或创建线程
  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId, threadType: 'lead_teammate' },
  }) || await createInternalThread({
    swarmSessionId,
    threadType: 'lead_teammate',
    subject: 'Lead-Teammate 协调',
  })

  const message = await sendInternalMessage({
    swarmSessionId,
    threadId: thread.id,
    senderAgentId: leadAgentId,
    recipientAgentId: teammate.id,
    messageType,
    content,
    metadata: {
      runtimeControl: buildLeadToTeammateRuntimeControl(messageType, {}),
    },
  })

  return {
    id: message.id,
  }
}

/**
 * 核心编排入口 - 由外部调用触发
 * 收集上下文，交给 LLM 决策，执行决策结果
 */
export async function orchestrate(input: OrchestrateInput) {
  // 1. 获取完整上下文
  const context = await getLeadContext(input.swarmSessionId, input.leadAgentId, input.userId)

  // 2. 记录用户消息到 Lead 上下文
  await appendAgentContextEntry({
    swarmSessionId: input.swarmSessionId,
    agentId: input.leadAgentId,
    sourceType: 'external_message',
    entryType: 'user_input',
    content: input.userMessage,
    metadata: {
      userId: input.userId,
      hasAttachments: input.attachments && input.attachments.length > 0,
      attachments: input.attachments,
    },
  })

  // 3. 返回上下文供上层调用 LLM
  return {
    context,
    userMessage: input.userMessage,
    attachments: input.attachments,
    // 提供工具函数给 LLM 决策后调用
    tools: {
      provisionTeammate: (def: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>) =>
        provisionTeammate(input.swarmSessionId, input.leadAgentId, def),
      decomposeTask: (tasks: Parameters<typeof decomposeTask>[2]) =>
        decomposeTask(input.swarmSessionId, input.leadAgentId, tasks),
      assignTaskToTeammate: (taskId: string, teammateId: string) =>
        assignTaskToTeammate(input.swarmSessionId, input.leadAgentId, taskId, teammateId),
      replyToUser: (content: string, metadata?: Record<string, unknown>) =>
        replyToUser(input.swarmSessionId, input.userId, input.leadAgentId, content, metadata),
      sendToTeammate: (teammateId: string, content: string, messageType?: string) =>
        sendToTeammate(input.swarmSessionId, input.leadAgentId, teammateId, content, messageType),
    },
  }
}


