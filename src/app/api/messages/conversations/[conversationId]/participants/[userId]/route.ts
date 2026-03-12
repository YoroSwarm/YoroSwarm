import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ conversationId: string; userId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { conversationId, userId } = await context.params

    await prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      create: { conversationId, userId },
      update: {},
    })

    return successResponse({ message: 'Participant added successfully' })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Add participant error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { conversationId, userId } = await context.params

    await prisma.conversationParticipant.deleteMany({
      where: { conversationId, userId },
    })

    return successResponse({ message: 'Participant removed successfully' })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Remove participant error:', error)
    return errorResponse('Internal server error', 500)
  }
}
