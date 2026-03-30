import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { getLeadAgentForSession, getOrCreateExternalConversation } from '@/lib/server/swarm-session'
import { attachFilesToTaskMetadata, listFilesForTask, listWorkspaceFiles } from '@/lib/server/session-workspace'

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

export async function listExternalMessages(
  swarmSessionId: string,
  userId: string,
  options?: { limit?: number }
) {
  const conversation = await getOrCreateExternalConversation(swarmSessionId, userId)
  const limit = typeof options?.limit === 'number' && options.limit > 0
    ? Math.min(Math.floor(options.limit), 200)
    : undefined
  const messages = await prisma.externalMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  })

  return { conversation, messages }
}

/**
 * 获取会话中的所有附件
 */
export async function getSessionAttachments(swarmSessionId: string) {
  const files = await listWorkspaceFiles(swarmSessionId)

  return files.map(file => ({
    fileId: file.id,
    fileName: file.relativePath,
    mimeType: file.mimeType,
    size: file.size,
    url: file.url,
    uploadedAt: file.createdAt,
  }))
}

/**
 * 将附件关联到任务
 */
export async function attachFilesToTask(
  swarmSessionId: string,
  taskId: string,
  fileIds: string[]
) {
  await attachFilesToTaskMetadata(swarmSessionId, taskId, fileIds)
  return { success: true, count: fileIds.length }
}

/**
 * 获取任务关联的附件
 */
export async function getTaskAttachments(taskId: string, swarmSessionId?: string) {
  if (!swarmSessionId) {
    const task = await prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      select: { swarmSessionId: true },
    })
    if (!task) return []
    swarmSessionId = task.swarmSessionId
  }

  const files = await listFilesForTask(swarmSessionId, taskId)
  return files.map(file => ({
    fileId: file.id,
    fileName: file.relativePath,
    mimeType: file.mimeType,
    size: file.size,
    url: file.url,
  }))
}
