import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { checkSessionInitializationStatus } from '@/lib/server/session-workspace'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _payload = await requireTokenPayload()
    const { id: sessionId } = await params

    // 验证用户是否有权访问该会话
    const status = await checkSessionInitializationStatus(sessionId)

    return successResponse(status)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get session status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
