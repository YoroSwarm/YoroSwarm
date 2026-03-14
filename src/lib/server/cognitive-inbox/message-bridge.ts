/**
 * 消息桥接器 - Message Bridge
 * 
 * 连接内部消息总线和认知收件箱架构
 * 当有新消息创建时，自动投递到对应Agent的收件箱
 */

import prisma from '@/lib/db'
import { deliverMessage, getCognitiveRuntime } from './cognitive-engine'
import type { InboxMessage } from './cognitive-state'
import { publishRealtimeMessage } from '@/app/api/ws/route'

/**
 * 初始化消息桥接器
 * 
 * 订阅InternalMessage的创建，将其转发到认知收件箱
 */
export async function initMessageBridge(): Promise<void> {
  console.log('[MessageBridge] Initializing...')

  // 这里可以设置数据库触发器或轮询机制
  // 简化版本：在创建消息时直接调用桥接
}

/**
 * 桥接消息到认知收件箱
 * 
 * 当InternalMessage被创建时调用
 */
export async function bridgeInternalMessage(
  swarmSessionId: string,
  messageId: string
): Promise<void> {
  const message = await prisma.internalMessage.findUnique({
    where: { id: messageId },
    include: {
      sender: true,
      thread: true,
    },
  })

  if (!message || !message.recipientAgentId) {
    return
  }

  if (!getCognitiveRuntime(swarmSessionId, message.recipientAgentId)) {
    const recipient = await prisma.agent.findUnique({ where: { id: message.recipientAgentId } })
    if (recipient?.kind === 'LEAD') {
      const session = await prisma.swarmSession.findUnique({ where: { id: swarmSessionId } })
      if (session?.userId) {
        const { initCognitiveLead } = await import('../cognitive-lead-runner')
        await initCognitiveLead({
          swarmSessionId,
          userId: session.userId,
          leadAgentId: message.recipientAgentId,
        })
      }
    } else if (recipient) {
      const leadAgent = await prisma.agent.findFirst({ where: { swarmSessionId, kind: 'LEAD' } })
      const { initCognitiveTeammate } = await import('../cognitive-teammate-runner')
      await initCognitiveTeammate(swarmSessionId, message.recipientAgentId, leadAgent?.id || '')
    }
  }

  // 转换为收件箱消息格式
  const inboxMessage: Omit<InboxMessage, 'id' | 'status' | 'receivedAt'> = {
    agentId: message.recipientAgentId,
    swarmSessionId,
    source: message.sender?.kind === 'LEAD' ? 'teammate' : 'teammate',
    senderId: message.senderAgentId,
    senderName: message.sender?.name || 'Unknown',
    type: mapMessageType(message.messageType),
    content: message.content,
    metadata: {
      threadId: message.threadId,
      internalMessageId: message.id,
      ...parseMetadata(message.metadata),
    },
    priority: inferPriority(message),
  }

  // 投递到收件箱
  await deliverMessage(swarmSessionId, message.recipientAgentId, inboxMessage)

  console.log(
    `[MessageBridge] Bridged message ${messageId} to inbox of agent ${message.recipientAgentId}`
  )
}

/**
 * 桥接任务完成消息
 * 
 * 当Teammate完成任务时调用
 */
export async function bridgeTaskCompletion(
  swarmSessionId: string,
  leadAgentId: string,
  teammateId: string,
  taskId: string,
  report: string
): Promise<void> {
  const [teammate, task] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({ where: { id: taskId } }),
  ])

  if (!leadAgentId || !task) {
    return
  }

  // 投递到Lead的收件箱
  await deliverMessage(swarmSessionId, leadAgentId, {
    agentId: leadAgentId,
    swarmSessionId,
    source: 'teammate',
    senderId: teammateId,
    senderName: teammate?.name || 'Teammate',
    type: 'task_complete',
    content: `[任务完成] ${task.title}\n\n汇报:\n${report}`,
    metadata: {
      taskId,
      teammateId,
      report,
    },
    priority: 'high',
  })

  // 发布实时消息
  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: taskId,
        title: task.title,
        status: 'completed',
        assignee_id: teammateId,
        assignee_name: teammate?.name || 'Unknown',
        swarm_session_id: swarmSessionId,
        message: `${teammate?.name || 'Teammate'} 完成了任务: ${task.title}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )
}

/**
 * 桥接用户消息到Lead
 */
export async function bridgeUserMessage(
  swarmSessionId: string,
  leadAgentId: string,
  userId: string,
  content: string,
  attachments?: unknown[]
): Promise<void> {
  await deliverMessage(swarmSessionId, leadAgentId, {
    agentId: leadAgentId,
    swarmSessionId,
    source: 'user',
    senderId: userId,
    senderName: 'User',
    type: 'direct_message',
    content,
    metadata: { attachments },
    priority: 'high', // 用户消息默认高优先级
  })
}

/**
 * 桥接队友间消息
 */
export async function bridgePeerMessage(
  swarmSessionId: string,
  recipientId: string,
  senderId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sender = await prisma.agent.findUnique({ where: { id: senderId } })

  await deliverMessage(swarmSessionId, recipientId, {
    agentId: recipientId,
    swarmSessionId,
    source: 'teammate',
    senderId,
    senderName: sender?.name || 'Teammate',
    type: 'coordination',
    content,
    metadata,
    priority: 'normal',
  })
}

// ============================================
// 辅助函数
// ============================================

function mapMessageType(internalType: string): InboxMessage['type'] {
  const typeMap: Record<string, InboxMessage['type']> = {
    'task_assignment': 'task_assignment',
    'task_complete': 'task_complete',
    'progress_update': 'direct_message',
    'coordination': 'coordination',
    'question': 'question',
    'urgent': 'urgent',
    'team_update': 'broadcast',
    'welcome': 'broadcast',
    'info': 'direct_message',
  }
  return typeMap[internalType] || 'direct_message'
}

function parseMetadata(metadataStr: string | null): Record<string, unknown> {
  if (!metadataStr) return {}
  try {
    return JSON.parse(metadataStr)
  } catch {
    return {}
  }
}

function inferPriority(message: {
  messageType: string
  sender?: { kind: string } | null
}): InboxMessage['priority'] {
  if (message.messageType === 'urgent') return 'critical'
  if (message.messageType === 'task_complete') return 'high'
  if (message.messageType === 'welcome' || message.messageType === 'team_update') return 'low'
  if (message.messageType === 'info') return 'low'
  if (message.sender?.kind === 'LEAD') return 'high'
  if (message.messageType === 'question') return 'normal'
  return 'normal'
}
