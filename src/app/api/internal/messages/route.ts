import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope } from '@/lib/server/swarm'
import { sendInternalMessage } from '@/lib/server/internal-bus'
import { publishRealtimeMessage } from '@/app/api/ws/route'

export async function GET(request: NextRequest) {
  try {
    await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('threadId') || searchParams.get('thread_id')
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const messages = await prisma.internalMessage.findMany({
      where: {
        swarmSessionId: session.id,
        ...(threadId ? { threadId } : {}),
      },
      include: {
        sender: true,
        recipient: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    return successResponse({
      messages: messages.map(msg => ({
        id: msg.id,
        thread_id: msg.threadId,
        sender_id: msg.senderAgentId,
        sender_name: msg.sender.name,
        recipient_id: msg.recipientAgentId,
        recipient_name: msg.recipient?.name || null,
        message_type: msg.messageType,
        content: msg.content,
        created_at: msg.createdAt.toISOString(),
        read_at: msg.readAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('List internal messages error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTokenPayload()
    const body = await request.json()
    const { swarmSessionId, threadId, senderAgentId, recipientAgentId, messageType, content, metadata } = body

    if (!swarmSessionId || !threadId || !senderAgentId || !content) {
      return errorResponse('swarmSessionId, threadId, senderAgentId, and content are required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const message = await sendInternalMessage({
      swarmSessionId: session.id,
      threadId,
      senderAgentId,
      recipientAgentId,
      messageType: messageType || 'message',
      content,
      metadata,
    })

    // 广播内部消息到 WebSocket（用于监控页实时显示）
    publishRealtimeMessage(
      {
        type: 'internal_message',
        payload: {
          message_id: message.id,
          thread_id: threadId,
          sender_id: senderAgentId,
          sender_name: (await prisma.agent.findUnique({ where: { id: senderAgentId } }))?.name || 'Unknown',
          recipient_id: recipientAgentId,
          recipient_name: recipientAgentId ? (await prisma.agent.findUnique({ where: { id: recipientAgentId } }))?.name || 'Unknown' : null,
          message_type: messageType || 'message',
          content: content.slice(0, 500),
          swarm_session_id: session.id,
          timestamp: message.createdAt.toISOString(),
        },
      },
      { sessionId: session.id }
    )

    return successResponse(
      {
        message_id: message.id,
        thread_id: message.threadId,
        sender_id: message.senderAgentId,
        recipient_id: message.recipientAgentId,
        message_type: message.messageType,
        content: message.content,
        created_at: message.createdAt.toISOString(),
      },
      'Message sent successfully'
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create internal message error:', error)
    return errorResponse('Internal server error', 500)
  }
}
