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

/**
 * 获取会话中的所有附件
 */
export async function getSessionAttachments(swarmSessionId: string) {
  const files = await prisma.file.findMany({
    where: { swarmSessionId },
    orderBy: { createdAt: 'desc' },
  })

  return files.map(file => ({
    fileId: file.id,
    fileName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `/api/files/${file.id}`,
    uploadedAt: file.createdAt.toISOString(),
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
  // 这里使用 Artifact 模型来建立文件和任务的关系
  const artifacts = await Promise.all(
    fileIds.map(fileId =>
      prisma.artifact.create({
        data: {
          swarmSessionId,
          sourceTaskId: taskId,
          kind: 'file_attachment',
          fileId,
          title: 'Task Attachment',
        },
      })
    )
  )

  return artifacts
}

/**
 * 获取任务关联的附件
 */
export async function getTaskAttachments(taskId: string) {
  const artifacts = await prisma.artifact.findMany({
    where: {
      sourceTaskId: taskId,
      kind: 'file_attachment',
    },
    include: { file: true },
  })

  return artifacts.map(a => ({
    artifactId: a.id,
    fileId: a.fileId,
    fileName: a.file?.originalName,
    mimeType: a.file?.mimeType,
    size: a.file?.size,
    url: a.file ? `/api/files/${a.file.id}` : null,
  }))
}
