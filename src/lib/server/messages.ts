import { ConversationType, MessageStatus, MessageType } from '@prisma/client'
import prisma from '@/lib/db'

export function parseMetadata(value?: string | null) {
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function toConversationType(type?: string | null): ConversationType {
  switch (type) {
    case 'group':
      return 'GROUP'
    case 'broadcast':
      return 'BROADCAST'
    default:
      return 'DIRECT'
  }
}

export function toMessageType(type?: string | null): MessageType {
  switch (type) {
    case 'task_update':
      return 'TASK_UPDATE'
    case 'agent_status':
      return 'AGENT_STATUS'
    case 'system':
      return 'SYSTEM'
    case 'file':
      return 'FILE'
    case 'broadcast':
      return 'BROADCAST'
    default:
      return 'TEXT'
  }
}

export function fromMessageType(type: MessageType) {
  return type.toLowerCase()
}

export function fromConversationType(type: ConversationType) {
  return type.toLowerCase()
}

export function fromMessageStatus(status: MessageStatus) {
  return status.toLowerCase()
}

export function serializeMessage(message: {
  id: string
  content: string
  type: MessageType
  senderId: string
  recipientId: string | null
  conversationId: string | null
  metadata: string | null
  status: MessageStatus
  createdAt: Date
  readAt: Date | null
}) {
  return {
    id: message.id,
    content: message.content,
    type: fromMessageType(message.type),
    sender_id: message.senderId,
    recipient_id: message.recipientId || undefined,
    conversation_id: message.conversationId || undefined,
    status: fromMessageStatus(message.status),
    metadata: parseMetadata(message.metadata),
    created_at: message.createdAt.toISOString(),
    read_at: message.readAt?.toISOString(),
  }
}

export async function serializeConversation(conversation: {
  id: string
  type: ConversationType
  title: string | null
  createdAt: Date
  updatedAt: Date
  participants: Array<{ userId: string; joinedAt: Date }>
}) {
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
  })

  return {
    id: conversation.id,
    type: fromConversationType(conversation.type),
    title: conversation.title || '未命名会话',
    created_by: conversation.participants[0]?.userId || '',
    created_at: conversation.createdAt.toISOString(),
    updated_at: conversation.updatedAt.toISOString(),
    is_active: true,
    participants: conversation.participants.map((participant) => ({
      user_id: participant.userId,
      joined_at: participant.joinedAt.toISOString(),
      is_admin: false,
    })),
    participant_count: conversation.participants.length,
    last_message: lastMessage ? serializeMessage(lastMessage) : undefined,
  }
}
