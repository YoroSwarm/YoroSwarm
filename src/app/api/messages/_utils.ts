import { cookies } from 'next/headers'
import {
  ConversationType,
  MessageStatus,
  MessageType,
  type Conversation,
  type ConversationParticipant,
  type Message,
} from '@prisma/client'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { unauthorizedResponse } from '@/lib/api/response'

export type AuthPayload = {
  userId: string
  username: string
  sessionId: string
  isSuperuser?: boolean
}

export type ConversationWithRelations = Conversation & {
  participants: Array<ConversationParticipant>
  messages: Array<Message>
}

const messageTypeMap: Record<string, MessageType> = {
  text: MessageType.TEXT,
  task_update: MessageType.TASK_UPDATE,
  agent_status: MessageType.AGENT_STATUS,
  system: MessageType.SYSTEM,
  file: MessageType.FILE,
  broadcast: MessageType.BROADCAST,
}

const messageTypeReverseMap: Record<MessageType, string> = {
  [MessageType.TEXT]: 'text',
  [MessageType.TASK_UPDATE]: 'task_update',
  [MessageType.AGENT_STATUS]: 'agent_status',
  [MessageType.SYSTEM]: 'system',
  [MessageType.FILE]: 'file',
  [MessageType.BROADCAST]: 'broadcast',
}

const messageStatusReverseMap: Record<MessageStatus, string> = {
  [MessageStatus.SENT]: 'sent',
  [MessageStatus.DELIVERED]: 'delivered',
  [MessageStatus.READ]: 'read',
  [MessageStatus.FAILED]: 'failed',
}

const conversationTypeMap: Record<string, ConversationType> = {
  direct: ConversationType.DIRECT,
  group: ConversationType.GROUP,
  broadcast: ConversationType.BROADCAST,
}

const conversationTypeReverseMap: Record<ConversationType, string> = {
  [ConversationType.DIRECT]: 'direct',
  [ConversationType.GROUP]: 'group',
  [ConversationType.BROADCAST]: 'broadcast',
}

export async function requireApiAuth(): Promise<{ payload: AuthPayload } | { response: Response }> {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  if (!token) {
    return { response: unauthorizedResponse('Authentication required') }
  }

  try {
    const payload = verifyAccessToken(token) as AuthPayload
    return { payload }
  } catch {
    return { response: unauthorizedResponse('Invalid token') }
  }
}

export function parseMessageType(type?: string | null): MessageType {
  if (!type) return MessageType.TEXT
  return messageTypeMap[type.toLowerCase()] || MessageType.TEXT
}

export function parseConversationType(type?: string | null): ConversationType {
  if (!type) return ConversationType.DIRECT
  return conversationTypeMap[type.toLowerCase()] || ConversationType.DIRECT
}

export function parseJsonMetadata(metadata: string | null): Record<string, unknown> | undefined {
  if (!metadata) return undefined

  try {
    return JSON.parse(metadata) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    content: message.content,
    type: messageTypeReverseMap[message.type],
    sender_id: message.senderId,
    recipient_id: message.recipientId || undefined,
    conversation_id: message.conversationId || undefined,
    status: messageStatusReverseMap[message.status],
    metadata: parseJsonMetadata(message.metadata),
    created_at: message.createdAt.toISOString(),
    read_at: message.readAt?.toISOString(),
  }
}

export function serializeConversation(
  conversation: ConversationWithRelations,
  currentUserId: string
) {
  const sortedMessages = [...conversation.messages].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const lastMessage = sortedMessages[0]
  const participants = conversation.participants.map((participant) => ({
    user_id: participant.userId,
    joined_at: participant.joinedAt.toISOString(),
    last_read_at: undefined,
    is_admin: participant.userId === currentUserId,
  }))

  return {
    id: conversation.id,
    type: conversationTypeReverseMap[conversation.type],
    title: conversation.title || undefined,
    created_by: conversation.participants[0]?.userId || currentUserId,
    created_at: conversation.createdAt.toISOString(),
    updated_at: conversation.updatedAt.toISOString(),
    is_active: true,
    participants,
    participant_count: participants.length,
    last_message: lastMessage ? serializeMessage(lastMessage) : undefined,
  }
}

export async function getConversationForUser(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [
        { type: ConversationType.BROADCAST },
        { participants: { some: { userId } } },
      ],
    },
    include: {
      participants: true,
      messages: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}
