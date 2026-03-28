import { NextRequest } from 'next/server'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import {
  deleteWorkspace,
  getWorkspaceByUser,
  updateWorkspace,
} from '@/lib/server/workspace'

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

    return successResponse(workspace)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get workspace error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await context.params
    const body = await request.json()

    const existing = await getWorkspaceByUser(id, payload.userId)
    if (!existing) {
      return notFoundResponse('Workspace not found')
    }

    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const description = typeof body.description === 'string' ? body.description.trim() : undefined
    const archivedAt =
      body.archivedAt === true
        ? new Date()
        : body.archivedAt === false || body.archivedAt === null
          ? null
          : undefined

    const updated = await updateWorkspace(id, { name, description, archivedAt })
    return successResponse(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update workspace error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await context.params

    const existing = await getWorkspaceByUser(id, payload.userId)
    if (!existing) {
      return notFoundResponse('Workspace not found')
    }

    await deleteWorkspace(id)
    return successResponse({ deleted: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Delete workspace error:', error)
    return errorResponse('Internal server error', 500)
  }
}
