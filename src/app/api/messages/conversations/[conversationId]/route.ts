import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { serializeConversation } from '@/lib/server/messages'
import { requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ conversationId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { conversationId } = await context.params
    const membership = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: payload.userId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    })

    if (!membership) {
      return notFoundResponse('Conversation not found')
    }

    return successResponse(await serializeConversation(membership.conversation))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get conversation error:', error)
    return errorResponse('Internal server error', 500)
  }
}
