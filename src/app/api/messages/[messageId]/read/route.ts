import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { serializeMessage } from '@/lib/server/messages'

type RouteContext = {
  params: Promise<{ messageId: string }>
}

export async function PUT(_request: Request, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { messageId } = await context.params

    const message = await prisma.message.findUnique({ where: { id: messageId } })
    if (!message || (message.recipientId && message.recipientId !== payload.userId && message.senderId !== payload.userId)) {
      return notFoundResponse('Message not found')
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'READ', readAt: new Date() },
    })

    return successResponse(serializeMessage(updated))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Mark message read error:', error)
    return errorResponse('Internal server error', 500)
  }
}
