import { NextRequest } from 'next/server'
import { getPendingApprovals } from '@/lib/server/tool-approval'
import { requireTokenPayload } from '@/lib/server/swarm'
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response'

/**
 * GET /api/tool-approvals?sessionId=xxx
 * 获取指定会话的待审批列表
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return validationErrorResponse(['sessionId is required'])
    }

    // 验证用户是否有权限访问该会话
    const { prisma } = await import('@/lib/db')
    const swarmSession = await prisma.swarmSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })

    if (!swarmSession || swarmSession.userId !== payload.userId) {
      return errorResponse('Forbidden', 403)
    }

    const approvals = await getPendingApprovals(sessionId)

    return successResponse({
      approvals: approvals.map(a => ({
        id: a.id,
        type: a.type,
        toolName: a.toolName,
        description: a.description,
        inputParams: JSON.parse(a.inputParams),
        workingDir: a.workingDir,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Tool approvals GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
