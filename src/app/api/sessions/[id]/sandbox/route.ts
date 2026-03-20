import { NextRequest } from 'next/server'
import {
  getSessionSandboxConfig,
  updateSessionSandboxConfig,
  resetSessionSandboxConfig,
  getFullSandboxStatus,
} from '@/lib/server/sandbox-config'
import { requireTokenPayload } from '@/lib/server/swarm'
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response'
import prisma from '@/lib/db'

async function verifySessionOwnership(sessionId: string, userId: string): Promise<boolean> {
  const session = await prisma.swarmSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  })
  return session?.userId === userId
}

/**
 * GET /api/sessions/[id]/sandbox
 * 获取会话的沙盒状态和配置
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { id: sessionId } = await params

    if (!(await verifySessionOwnership(sessionId, payload.userId))) {
      return errorResponse('Forbidden', 403)
    }

    const status = getFullSandboxStatus(sessionId)
    return successResponse(status)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Sandbox GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * PATCH /api/sessions/[id]/sandbox
 * 更新会话的沙盒配置
 *
 * Body:
 *   defaultPolicy?: 'workspace-write' | 'workspace-write-net' | 'read-only' | 'disabled'
 *   autoNetworkUpgrade?: boolean
 *   extraWritableRoots?: string[]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { id: sessionId } = await params

    if (!(await verifySessionOwnership(sessionId, payload.userId))) {
      return errorResponse('Forbidden', 403)
    }

    const body = await request.json()
    const { defaultPolicy, autoNetworkUpgrade, extraWritableRoots } = body

    // Validate fields if provided
    const validPolicies = ['workspace-write', 'workspace-write-net', 'read-only', 'disabled']
    if (defaultPolicy !== undefined && !validPolicies.includes(defaultPolicy)) {
      return validationErrorResponse([`defaultPolicy must be one of: ${validPolicies.join(', ')}`])
    }

    if (autoNetworkUpgrade !== undefined && typeof autoNetworkUpgrade !== 'boolean') {
      return validationErrorResponse(['autoNetworkUpgrade must be a boolean'])
    }

    if (extraWritableRoots !== undefined) {
      if (!Array.isArray(extraWritableRoots)) {
        return validationErrorResponse(['extraWritableRoots must be an array of absolute paths'])
      }
      for (const root of extraWritableRoots) {
        if (typeof root !== 'string' || !root.startsWith('/')) {
          return validationErrorResponse([`Each extraWritableRoot must be an absolute path, got: ${root}`])
        }
      }
    }

    const patch: Record<string, unknown> = {}
    if (defaultPolicy !== undefined) patch.defaultPolicy = defaultPolicy
    if (autoNetworkUpgrade !== undefined) patch.autoNetworkUpgrade = autoNetworkUpgrade
    if (extraWritableRoots !== undefined) patch.extraWritableRoots = extraWritableRoots

    const updated = updateSessionSandboxConfig(sessionId, patch)
    return successResponse({
      config: updated,
      status: getFullSandboxStatus(sessionId),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    if (error instanceof Error && error.message.startsWith('Invalid policy')) {
      return validationErrorResponse([error.message])
    }
    console.error('[API] Sandbox PATCH error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * DELETE /api/sessions/[id]/sandbox
 * 重置会话的沙盒配置为默认值
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { id: sessionId } = await params

    if (!(await verifySessionOwnership(sessionId, payload.userId))) {
      return errorResponse('Forbidden', 403)
    }

    resetSessionSandboxConfig(sessionId)
    return successResponse({
      reset: true,
      config: getSessionSandboxConfig(sessionId),
      status: getFullSandboxStatus(sessionId),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Sandbox DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
