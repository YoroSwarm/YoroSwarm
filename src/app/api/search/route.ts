import prisma from '@/lib/db'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'

export async function GET(request: Request) {
  try {
    const payload = await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    if (!q || q.length < 1) {
      return successResponse({ messages: [] })
    }

    // Get user's session IDs
    const userSessions = await prisma.swarmSession.findMany({
      where: { userId: payload.userId },
      select: { id: true, title: true },
    })
    const sessionIds = userSessions.map(s => s.id)
    const sessionMap = new Map(userSessions.map(s => [s.id, s.title]))

    if (sessionIds.length === 0) {
      return successResponse({ messages: [] })
    }

    // Search external messages by content
    const messages = await prisma.externalMessage.findMany({
      where: {
        swarmSessionId: { in: sessionIds },
        content: { contains: q },
      },
      select: {
        id: true,
        swarmSessionId: true,
        senderType: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const results = messages.map(m => ({
      id: m.id,
      sessionId: m.swarmSessionId,
      sessionTitle: sessionMap.get(m.swarmSessionId) || '未命名会话',
      senderType: m.senderType,
      content: m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content,
      createdAt: m.createdAt.toISOString(),
    }))

    return successResponse({ messages: results })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Search error:', error)
    return errorResponse('Internal server error', 500)
  }
}
