import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'

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
  }

  return message
}
