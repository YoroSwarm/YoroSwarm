import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { resolveSessionScope } from '@/lib/server/swarm'
import { listWorkspaceDirectory } from '@/lib/server/session-workspace'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value
    if (!token) return unauthorizedResponse('Authentication required')

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')
    const directoryPath = searchParams.get('directoryPath') || searchParams.get('directory_path') || ''
    const recursive = searchParams.get('recursive') == '1'

    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found', 404)
    }

    const tree = await listWorkspaceDirectory(sessionScope.id, directoryPath, recursive)
    return successResponse(tree)
  } catch (error) {
    console.error('List workspace tree error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
}
