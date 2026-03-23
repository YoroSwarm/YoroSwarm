import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { checkSessionInitializationStatus, deleteSessionVenv, ensureSessionVenv } from '@/lib/server/session-workspace'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _payload = await requireTokenPayload()
    const { id: sessionId } = await params

    // 删除旧的 venv
    await deleteSessionVenv(sessionId)

    // 重新创建 venv（会触发重新安装包）
    await ensureSessionVenv(sessionId)

    // 返回最新状态
    const status = await checkSessionInitializationStatus(sessionId)

    return successResponse(status)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Retry venv error:', error)
    return errorResponse('Internal server error', 500)
  }
}
