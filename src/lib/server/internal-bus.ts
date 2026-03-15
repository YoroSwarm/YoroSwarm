import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'

type RuntimeControlMetadata = {
  plane?: 'control' | 'work'
  interruption?: 'none' | 'soft' | 'hard'
  workUnitKey?: string
  supersedesPending?: boolean
  controlType?: 'pause_execution' | 'resume_execution' | 'cancel_execution' | 'supersede_execution' | string
}

function mergeRuntimeControl(
  metadata: Record<string, unknown> | null | undefined,
  runtimeControl: RuntimeControlMetadata
): Record<string, unknown> {
  const existing = metadata && typeof metadata === 'object'
    ? (metadata.runtimeControl as Record<string, unknown> | undefined)
    : undefined

  return {
    ...(metadata || {}),
    runtimeControl: {
      ...(existing || {}),
      ...runtimeControl,
    },
  }
}

function buildPeerRuntimeControl(messageType: string): RuntimeControlMetadata {
  switch (messageType) {
    case 'pause_execution':
      return { plane: 'control', interruption: 'hard', supersedesPending: true, controlType: 'pause_execution' }
    case 'resume_execution':
      return { plane: 'control', interruption: 'hard', supersedesPending: true, controlType: 'resume_execution' }
    case 'cancel_execution':
      return { plane: 'control', interruption: 'hard', supersedesPending: true, controlType: 'cancel_execution' }
    case 'supersede_execution':
      return { plane: 'control', interruption: 'hard', supersedesPending: true, controlType: 'supersede_execution' }
    case 'question':
      return { plane: 'control', interruption: 'soft', supersedesPending: true }
    case 'response':
      return { plane: 'control', interruption: 'soft', supersedesPending: true }
    case 'coordination':
      return { plane: 'control', interruption: 'soft', supersedesPending: true }
    case 'warning':
      return { plane: 'control', interruption: 'soft' }
    case 'urgent':
      return { plane: 'control', interruption: 'hard' }
    default:
      return { plane: 'work', interruption: 'none' }
  }
}

function buildBroadcastRuntimeControl(messageType: string): RuntimeControlMetadata {
  switch (messageType) {
    case 'warning':
      return { plane: 'control', interruption: 'soft' }
    case 'team_update':
    case 'welcome':
      return { plane: 'control', interruption: 'none', supersedesPending: true }
    default:
      return { plane: 'work', interruption: 'none' }
  }
}

function normalizeAgentRef(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function buildAgentLookupKeys(agent: { id: string; name: string; role: string }): string[] {
  return [agent.id, agent.name, agent.role]
    .map(value => value.trim())
    .filter(Boolean)
}

export async function resolveAgentInSession(
  swarmSessionId: string,
  agentRef: string,
  options: {
    excludeAgentIds?: string[]
  } = {}
) {
  const trimmedRef = agentRef.trim()
  if (!trimmedRef) return null

  const candidates = await prisma.agent.findMany({
    where: {
      swarmSessionId,
      status: { not: 'OFFLINE' },
      ...(options.excludeAgentIds?.length ? { id: { notIn: options.excludeAgentIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      swarmSessionId: true,
      name: true,
      role: true,
      status: true,
      kind: true,
    },
  })

  const exactId = candidates.find(agent => agent.id === trimmedRef)
  if (exactId) return exactId

  const normalizedRef = normalizeAgentRef(trimmedRef)
  const exactMatch = candidates.find(agent =>
    buildAgentLookupKeys(agent).some(key => normalizeAgentRef(key) === normalizedRef)
  )
  if (exactMatch) return exactMatch

  const fuzzyMatches = candidates.filter(agent =>
    buildAgentLookupKeys(agent).some(key => {
      const normalizedKey = normalizeAgentRef(key)
      return normalizedKey.includes(normalizedRef) || normalizedRef.includes(normalizedKey)
    })
  )

  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0]
  }

  return null
}

export async function createInternalThread(input: {
  swarmSessionId: string
  threadType: string
  subject?: string | null
  relatedTaskId?: string | null
}) {
  return prisma.internalThread.create({
    data: {
      swarmSessionId: input.swarmSessionId,
      threadType: input.threadType,
      subject: input.subject || null,
      relatedTaskId: input.relatedTaskId || null,
    },
  })
}

export async function sendInternalMessage(input: {
  swarmSessionId: string
  threadId: string
  senderAgentId: string
  recipientAgentId?: string | null
  messageType: string
  content: string
  metadata?: Record<string, unknown> | null
}) {
  const [thread, sender, recipient] = await Promise.all([
    prisma.internalThread.findUnique({ where: { id: input.threadId } }),
    prisma.agent.findUnique({ where: { id: input.senderAgentId } }),
    input.recipientAgentId
      ? prisma.agent.findUnique({ where: { id: input.recipientAgentId } })
      : Promise.resolve(null),
  ])

  if (!thread || thread.swarmSessionId !== input.swarmSessionId) {
    throw new Error(`INVALID_INTERNAL_THREAD:${input.threadId}`)
  }

  if (!sender || sender.swarmSessionId !== input.swarmSessionId) {
    throw new Error(`INVALID_SENDER_AGENT:${input.senderAgentId}`)
  }

  if (input.recipientAgentId && (!recipient || recipient.swarmSessionId !== input.swarmSessionId)) {
    throw new Error(`INVALID_RECIPIENT_AGENT:${input.recipientAgentId}`)
  }

  const message = await prisma.internalMessage.create({
    data: {
      swarmSessionId: input.swarmSessionId,
      threadId: input.threadId,
      senderAgentId: input.senderAgentId,
      recipientAgentId: input.recipientAgentId || null,
      messageType: input.messageType,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })

  if (input.recipientAgentId) {
    await appendAgentContextEntry({
      swarmSessionId: input.swarmSessionId,
      agentId: input.recipientAgentId,
      sourceType: 'internal_message',
      sourceId: message.id,
      entryType: 'internal_message',
      content: input.content,
      metadata: {
        threadId: input.threadId,
        senderAgentId: input.senderAgentId,
        messageType: input.messageType,
      },
      visibility: 'private',
    })

    try {
      const { bridgeInternalMessage } = await import('./cognitive-inbox/message-bridge')
      await bridgeInternalMessage(input.swarmSessionId, message.id)
    } catch (error) {
      console.error('[InternalBus] Failed to bridge internal message into cognitive inbox:', error)
    }
  }

  return message
}

/**
 * 广播消息给所有团队成员（除发送者外）
 * 用于队友间直接通信和团队公告
 */
export async function broadcastToTeam(input: {
  swarmSessionId: string
  senderAgentId: string
  messageType: string
  content: string
  metadata?: Record<string, unknown> | null
  excludeAgentIds?: string[] // 额外排除的agent ID列表
}) {
  // 获取所有活跃的团队成员
  const teammates = await prisma.agent.findMany({
    where: {
      swarmSessionId: input.swarmSessionId,
      status: { not: 'OFFLINE' },
      id: { not: input.senderAgentId }, // 排除发送者
    },
  })

  // 进一步排除指定列表
  const excludeSet = new Set(input.excludeAgentIds || [])
  const recipients = teammates.filter(t => !excludeSet.has(t.id))

  // 创建广播线程
  const thread = await createInternalThread({
    swarmSessionId: input.swarmSessionId,
    threadType: 'team_broadcast',
    subject: `Broadcast from ${input.senderAgentId}`,
  })

  // 并行发送消息给所有接收者
  const messages = await Promise.all(
    recipients.map(recipient =>
      sendInternalMessage({
        swarmSessionId: input.swarmSessionId,
        threadId: thread.id,
        senderAgentId: input.senderAgentId,
        recipientAgentId: recipient.id,
        messageType: input.messageType,
        content: input.content,
        metadata: mergeRuntimeControl({
          ...input.metadata,
          isBroadcast: true,
          totalRecipients: recipients.length,
        }, buildBroadcastRuntimeControl(input.messageType)),
      })
    )
  )

  // 发布实时消息通知
  const sender = await prisma.agent.findUnique({
    where: { id: input.senderAgentId },
  })

  publishRealtimeMessage(
    {
      type: 'internal_message',
      payload: {
        action: 'team_broadcast',
        sender_id: input.senderAgentId,
        sender_name: sender?.name || 'Unknown',
        message_type: input.messageType,
        content: input.content.slice(0, 200),
        recipient_count: recipients.length,
        swarm_session_id: input.swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: input.swarmSessionId }
  )

  return {
    threadId: thread.id,
    messageCount: messages.length,
    recipientIds: recipients.map(r => r.id),
    messages,
  }
}

/**
 * 发送点对点消息给特定队友
 * 用于直接的队友间通信
 */
export async function sendPeerToPeerMessage(input: {
  swarmSessionId: string
  senderAgentId: string
  recipientAgentId: string
  messageType: string
  content: string
  metadata?: Record<string, unknown> | null
}) {
  const recipient = await resolveAgentInSession(input.swarmSessionId, input.recipientAgentId, {
    excludeAgentIds: [input.senderAgentId],
  })

  if (!recipient) {
    throw new Error(`Teammate not found: ${input.recipientAgentId}`)
  }

  // 创建或获取P2P线程
  const threadId = await getOrCreateP2PThread(
    input.swarmSessionId,
    input.senderAgentId,
    recipient.id
  )

  const message = await sendInternalMessage({
    swarmSessionId: input.swarmSessionId,
    threadId,
    senderAgentId: input.senderAgentId,
    recipientAgentId: recipient.id,
    messageType: input.messageType,
    content: input.content,
    metadata: mergeRuntimeControl({
      ...input.metadata,
      isPeerToPeer: true,
    }, buildPeerRuntimeControl(input.messageType)),
  })

  // 获取发送者信息用于实时通知
  const sender = await prisma.agent.findUnique({ where: { id: input.senderAgentId } })

  publishRealtimeMessage(
    {
      type: 'internal_message',
      payload: {
        action: 'peer_message',
        sender_id: input.senderAgentId,
        sender_name: sender?.name || 'Unknown',
        recipient_id: recipient.id,
        recipient_name: recipient.name || 'Unknown',
        message_type: input.messageType,
        content: input.content.slice(0, 200),
        swarm_session_id: input.swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: input.swarmSessionId }
  )

  return message
}

/**
 * 获取或创建P2P线程
 * 确保两个agent之间有唯一的通信线程
 */
async function getOrCreateP2PThread(
  swarmSessionId: string,
  agentA: string,
  agentB: string
): Promise<string> {
  // 使用排序后的ID生成一致的线程类型标识
  const sortedIds = [agentA, agentB].sort()
  const threadType = `p2p_${sortedIds[0]}_${sortedIds[1]}`

  let thread = await prisma.internalThread.findFirst({
    where: {
      swarmSessionId,
      threadType,
    },
  })

  if (!thread) {
    const [agentAData, agentBData] = await Promise.all([
      prisma.agent.findUnique({ where: { id: agentA } }),
      prisma.agent.findUnique({ where: { id: agentB } }),
    ])

    thread = await createInternalThread({
      swarmSessionId,
      threadType,
      subject: `P2P: ${agentAData?.name || agentA} ↔ ${agentBData?.name || agentB}`,
    })
  }

  return thread.id
}

/**
 * 获取团队成员列表（供新创建的队友感知其他队友）
 */
export async function getTeamRoster(swarmSessionId: string, excludeAgentId?: string) {
  const teammates = await prisma.agent.findMany({
    where: {
      swarmSessionId,
      status: { not: 'OFFLINE' },
      ...(excludeAgentId ? { id: { not: excludeAgentId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      role: true,
      description: true,
      status: true,
      capabilities: true,
      createdAt: true,
    },
  })

  return teammates.map(t => ({
    ...t,
    capabilities: t.capabilities ? JSON.parse(t.capabilities) : [],
  }))
}

/**
 * 为新创建的队友初始化团队感知
 * 向新队友介绍现有团队成员
 */
export async function initializeTeamAwareness(input: {
  swarmSessionId: string
  newAgentId: string
  leadAgentId: string
}) {
  const roster = await getTeamRoster(input.swarmSessionId, input.newAgentId)

  if (roster.length === 0) {
    return { hasExistingTeammates: false }
  }

  // 构建团队介绍信息
  const teamInfo = roster
    .map(t => `- ${t.name} (角色: ${t.role}, 状态: ${t.status})`)
    .join('\n')

  const introMessage = `欢迎来到团队！当前团队成员:\n${teamInfo}\n\n你可以使用 send_message_to_teammate 工具与他们直接通信协作。`

  // 向新agent添加上下文条目
  await appendAgentContextEntry({
    swarmSessionId: input.swarmSessionId,
    agentId: input.newAgentId,
    sourceType: 'system',
    sourceId: null,
    entryType: 'team_introduction',
    content: introMessage,
    metadata: {
      existingTeammates: roster.map(t => ({ id: t.id, name: t.name, role: t.role })),
    },
    visibility: 'private',
  })

  // 不再向现有队友广播 welcome/team_update。
  // 团队拓扑是静态上下文，不应占用认知收件箱和工具预算。

  return {
    hasExistingTeammates: true,
    teammateCount: roster.length,
    teammates: roster,
  }
}
