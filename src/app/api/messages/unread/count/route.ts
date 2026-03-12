import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'

export async function GET() {
  try {
    const payload = await requireTokenPayload()

    const unreadMessages = await prisma.message.findMany({
      where: {
        OR: [
          { recipientId: payload.userId },
          {
            conversation: {
              participants: {
                some: { userId: payload.userId },
              },
            },
            senderId: { not: payload.userId },
          },
        ],
        status: { in: ['SENT', 'DELIVERED'] },
      },
      select: { conversationId: true },
    })

    const conversationUnread = unreadMessages.reduce<Record<string, number>>((acc, message) => {
      if (message.conversationId) {
        acc[message.conversationId] = (acc[message.conversationId] || 0) + 1
      }
      return acc
    }, {})

    return successResponse({
      total_unread: unreadMessages.length,
      conversation_unread: conversationUnread,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get unread count error:', error)
    return errorResponse('Internal server error', 500)
  }
}
