import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ conversationId: string }>
}

export async function PUT(_request: Request, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { conversationId } = await context.params

    const membership = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: payload.userId },
    })
    if (!membership) {
      return successResponse({ marked_as_read: 0 })
    }

    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: payload.userId },
        status: { in: ['SENT', 'DELIVERED'] },
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    })

    return successResponse({ marked_as_read: result.count })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Mark conversation read error:', error)
    return errorResponse('Internal server error', 500)
  }
}
