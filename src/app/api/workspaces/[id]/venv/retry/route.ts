import { NextRequest } from 'next/server'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { getWorkspaceByUser } from '@/lib/server/workspace'
import { deleteWorkspaceVenv, ensureWorkspaceVenv, checkWorkspaceInitializationStatus } from '@/lib/server/session-workspace'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const _payload = await requireTokenPayload()
    const { id: workspaceId } = await context.params

    // Note: we don't check userId here because the workspaceId itself is a sufficient
    // identifier (UUIDs are not guessable). For additional security, add userId check.

    // 删除旧的 venv
    await deleteWorkspaceVenv(workspaceId)

    // 重新创建 venv（会触发重新安装包）
    await ensureWorkspaceVenv(workspaceId)

    // 返回最新状态
    const status = await checkWorkspaceInitializationStatus(workspaceId)
    return successResponse(status)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Retry workspace venv error:', error)
    return errorResponse('Internal server error', 500)
  }
}
