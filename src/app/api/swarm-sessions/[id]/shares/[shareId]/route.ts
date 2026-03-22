import { NextRequest } from 'next/server'
import { rm } from 'fs/promises'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope } from '@/lib/server/swarm'

type RouteContext = { params: Promise<{ id: string; shareId: string }> }

// DELETE — Remove a share link and its snapshot files
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id, shareId } = await context.params

    const session = await resolveSessionScope({ swarmSessionId: id, userId: payload.userId })
    if (!session) return notFoundResponse('Session not found')

    const share = await prisma.sessionShare.findFirst({
      where: { id: shareId, swarmSessionId: id },
    })
    if (!share) return notFoundResponse('Share not found')

    // Delete snapshot files
    if (share.snapshotFilesPath) {
      try {
        await rm(share.snapshotFilesPath, { recursive: true, force: true })
      } catch (err) {
        console.error(`[Share] Failed to delete snapshot dir:`, err)
      }
    }

    await prisma.sessionShare.delete({ where: { id: shareId } })

    return successResponse({ deleted: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Delete share error:', error)
    return errorResponse('Internal server error', 500)
  }
}
