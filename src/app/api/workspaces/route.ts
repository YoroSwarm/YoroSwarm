import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import {
  createWorkspace,
  listWorkspaces,
  type WorkspaceWithStats,
} from '@/lib/server/workspace'

export async function GET() {
  try {
    const payload = await requireTokenPayload()
    const workspaces = await listWorkspaces(payload.userId)

    return successResponse({
      items: workspaces,
      total: workspaces.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('List workspaces error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const body = await request.json()

    const name = typeof body.name === 'string' ? body.name.trim() : null
    if (!name) {
      return errorResponse('Workspace name is required', 400)
    }

    const description = typeof body.description === 'string' ? body.description.trim() : undefined

    const workspace = await createWorkspace({
      userId: payload.userId,
      name,
      description,
    })

    return successResponse(workspace, 'Workspace created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create workspace error:', error)
    return errorResponse('Internal server error', 500)
  }
}
