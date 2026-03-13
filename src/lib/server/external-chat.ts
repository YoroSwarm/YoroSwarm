import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { getLeadAgentForSession, getOrCreateExternalConversation } from '@/lib/server/swarm-session'

export async function appendExternalUserMessage(input: {
  swarmSessionId: string
  userId: string
  content: string
  messageType?: string
  metadata?: Record<string, unknown> | null
}) {
  const conversation = await getOrCreateExternalConversation(input.swarmSessionId, input.userId)
  const message = await prisma.externalMessage.create({
    data: {
      conversationId: conversation.id,
      swarmSessionId: input.swarmSessionId,
      senderType: 'user',
      senderId: input.userId,
      content: input.content,
      messageType: input.messageType || 'text',
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })

  const lead = await getLeadAgentForSession(input.swarmSessionId)
  if (lead) {
    await appendAgentContextEntry({
      swarmSessionId: input.swarmSessionId,
      agentId: lead.id,
      sourceType: 'external_message',
      sourceId: message.id,
      entryType: 'user_goal',
      content: input.content,
      metadata: {
        conversationId: conversation.id,
        senderType: 'user',
      },
      visibility: 'private',
    })
  }

  return { conversation, message, lead }
}

export async function appendLeadReply(input: {
  swarmSessionId: string
  userId: string
  leadAgentId: string
  content: string
  messageType?: string
  metadata?: Record<string, unknown> | null
}) {
  const conversation = await getOrCreateExternalConversation(input.swarmSessionId, input.userId)
  return prisma.externalMessage.create({
    data: {
      conversationId: conversation.id,
      swarmSessionId: input.swarmSessionId,
      senderType: 'lead',
      senderId: input.leadAgentId,
      content: input.content,
      messageType: input.messageType || 'text',
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

export async function listExternalMessages(swarmSessionId: string, userId: string) {
  const conversation = await getOrCreateExternalConversation(swarmSessionId, userId)
  const messages = await prisma.externalMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  })

  return { conversation, messages }
}
