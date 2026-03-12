import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api/response'
import { parseMessageType, requireApiAuth, serializeMessage } from './_utils'
import { publishConversationMessage } from '@/app/api/ws/route'

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiAuth()
    if ('response' in auth) return auth.response

    const { payload } = auth
    const { searchParams } = new URL(request.url)

    const conversationId = searchParams.get('conversation_id') || searchParams.get('conversationId')
    const senderId = searchParams.get('sender_id')
    const recipientId = searchParams.get('recipient_id')
    const messageType = searchParams.get('message_type')
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 20)
    const before = searchParams.get('before')
    const skip = (page - 1) * pageSize

    const where = {
      OR: [
        { senderId: payload.userId },
        { recipientId: payload.userId },
        { conversation: { participants: { some: { userId: payload.userId } } } },
        { conversation: { type: 'BROADCAST' as const } },
      ],
      ...(conversationId ? { conversationId } : {}),
      ...(senderId ? { senderId } : {}),
      ...(recipientId ? { recipientId } : {}),
      ...(messageType ? { type: parseMessageType(messageType) } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.message.count({ where }),
    ])

    return successResponse({
      items: messages.map(serializeMessage),
      total,
      page,
      page_size: pageSize,
      has_more: skip + messages.length < total,
    })
  } catch (error) {
    console.error('List messages error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiAuth()
    if ('response' in auth) return auth.response

    const { payload } = auth
    const body = await request.json()
    const recipientId = body.recipient_id || body.recipientId
    const conversationId = body.conversation_id || body.conversationId
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const type = parseMessageType(body.type)
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined

    if (!content) {
      return errorResponse('Message content is required', 400)
    }

    if (!recipientId && !conversationId) {
      return errorResponse('recipient_id or conversation_id is required', 400)
    }

    if (conversationId) {
      const membership = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [
            { type: 'BROADCAST' },
            { participants: { some: { userId: payload.userId } } },
          ],
        },
      })

      if (!membership) {
        return errorResponse('Conversation not found', 404)
      }
    }

    const message = await prisma.message.create({
      data: {
        senderId: payload.userId,
        recipientId,
        conversationId,
        content,
        type,
        metadata: metadata ? JSON.stringify(metadata) : null,
        status: 'SENT',
      },
    })

    const serializedMessage = serializeMessage(message)
    if (serializedMessage.conversation_id) {
      publishConversationMessage({
        ...serializedMessage,
        sender_name: payload.username,
      })
    }

    return successResponse(serializedMessage, 'Message sent successfully')
  } catch (error) {
    console.error('Send message error:', error)
    return errorResponse('Internal server error', 500)
  }
}
