import { NextRequest } from 'next/server'
import {
  getUserSessionRules,
  addSessionRule,
  removeSessionRule,
  clearSessionRules,
  getSessionApprovalStats,
  type ApprovalRule,
} from '@/lib/server/session-approval-rules'
import { RISK_LEVEL_CONFIG } from '@/lib/server/command-risk'
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
 * GET /api/sessions/[id]/approval-rules
 * 获取当前会话的审批规则
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

    const rules = getUserSessionRules(sessionId)
    const stats = getSessionApprovalStats(sessionId)

    return successResponse({
      rules,
      stats,
      riskLevels: RISK_LEVEL_CONFIG,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Approval rules GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/sessions/[id]/approval-rules
 * 添加审批规则
 */
export async function POST(
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
    const { matchType, matchValue, action, description } = body

    if (!matchType || !matchValue || !action) {
      return validationErrorResponse(['matchType, matchValue, and action are required'])
    }

    const validMatchTypes = ['prefix', 'regex', 'risk_level', 'category']
    if (!validMatchTypes.includes(matchType)) {
      return validationErrorResponse([`matchType must be one of: ${validMatchTypes.join(', ')}`])
    }

    const validActions = ['auto_approve', 'always_reject', 'require_approval']
    if (!validActions.includes(action)) {
      return validationErrorResponse([`action must be one of: ${validActions.join(', ')}`])
    }

    // 不允许对 critical 风险等级设置 auto_approve
    if (matchType === 'risk_level' && matchValue === 'critical' && action === 'auto_approve') {
      return errorResponse('Cannot auto-approve critical risk level commands', 400)
    }

    const rule = addSessionRule(sessionId, {
      matchType,
      matchValue,
      action,
      source: 'user' as const,
      description,
    })

    return successResponse({ rule })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Approval rules POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * DELETE /api/sessions/[id]/approval-rules
 * 删除审批规则（通过 body 中的 ruleId）或清空所有规则（body 中 clearAll=true）
 */
export async function DELETE(
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

    if (body.clearAll) {
      clearSessionRules(sessionId)
      return successResponse({ cleared: true })
    }

    const { ruleId } = body
    if (!ruleId) {
      return validationErrorResponse(['ruleId is required (or use clearAll: true)'])
    }

    const removed = removeSessionRule(sessionId, ruleId)
    if (!removed) {
      return errorResponse('Rule not found', 404)
    }

    return successResponse({ removed: true, ruleId })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API] Approval rules DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
