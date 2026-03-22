import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, notFoundResponse } from '@/lib/api/response'

type RouteContext = { params: Promise<{ token: string }> }

// GET — Public access to shared session (no auth required)
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params

    const share = await prisma.sessionShare.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        snapshotTitle: true,
        snapshotMessages: true,
        snapshotActivities: true,
        snapshotFileIds: true,
        snapshotMeta: true,
        createdAt: true,
      },
    })

    if (!share) return notFoundResponse('Share not found or has been deleted')

    return successResponse({
      id: share.id,
      title: share.snapshotTitle,
      messages: JSON.parse(share.snapshotMessages),
      activities: JSON.parse(share.snapshotActivities),
      fileIds: JSON.parse(share.snapshotFileIds),
      meta: share.snapshotMeta ? JSON.parse(share.snapshotMeta) : null,
      createdAt: share.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Get share error:', error)
    return errorResponse('Internal server error', 500)
  }
}
