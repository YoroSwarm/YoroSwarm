import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { serializeMessage } from '@/lib/server/messages'
import { requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ conversationId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { conversationId } = await context.params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '20')

    const membership = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: payload.userId },
    })
    if (!membership) {
      return notFoundResponse('Conversation not found')
    }

    const total = await prisma.message.count({ where: { conversationId } })
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
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

    console.error('Get conversation messages error:', error)
    return errorResponse('Internal server error', 500)
  }
}
