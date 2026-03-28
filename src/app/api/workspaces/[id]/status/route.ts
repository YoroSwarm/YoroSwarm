import { NextRequest } from 'next/server'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { getWorkspaceByUser } from '@/lib/server/workspace'
import { checkWorkspaceInitializationStatus } from '@/lib/server/session-workspace'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await context.params

    const workspace = await getWorkspaceByUser(id, payload.userId)
    if (!workspace) {
      return notFoundResponse('Workspace not found')
    }

    const status = await checkWorkspaceInitializationStatus(id)
    return successResponse(status)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get workspace status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
