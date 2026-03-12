import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { serializeMessage } from '@/lib/server/messages'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '20')

    const total = await prisma.message.count({
      where: {
        type: 'BROADCAST',
        OR: [
          { senderId: payload.userId },
          { recipientId: payload.userId },
          { recipientId: null },
        ],
      },
    })

    const messages = await prisma.message.findMany({
      where: {
        type: 'BROADCAST',
        OR: [
          { senderId: payload.userId },
          { recipientId: payload.userId },
          { recipientId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return successResponse({
      items: messages.map(serializeMessage),
      total,
      page,
      page_size: pageSize,
      has_more: page * pageSize < total,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get broadcast messages error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const body = await request.json()

    if (!body.content) {
      return errorResponse('Message content is required', 400)
    }

    const message = await prisma.message.create({
      data: {
        senderId: payload.userId,
        content: body.content,
        type: 'BROADCAST',
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        status: 'SENT',
      },
    })

    return successResponse(serializeMessage(message), 'Broadcast sent successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Send broadcast error:', error)
    return errorResponse('Internal server error', 500)
  }
}
