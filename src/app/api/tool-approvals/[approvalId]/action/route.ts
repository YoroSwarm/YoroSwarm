import { NextRequest } from 'next/server'
import { handleApprovalDecision } from '@/lib/server/tool-approval'
import { requireTokenPayload } from '@/lib/server/swarm'
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response'

/**
 * POST /api/tool-approvals/[approvalId]/action
 * 处理审批决定（approve/reject）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { approvalId } = await params
    const body = await request.json()
    const { decision } = body

    if (decision !== 'approve' && decision !== 'reject') {
      return validationErrorResponse(['Invalid decision. Must be "approve" or "reject"'])
    }

    const result = await handleApprovalDecision(approvalId, decision, payload.userId)

    if (!result.success) {
      return errorResponse(result.error || 'Failed to process decision', 400)
    }

    return successResponse({ approvalId, decision })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Tool approval action error:', error)
    return errorResponse('Internal server error', 500)
  }
}
