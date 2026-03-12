import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { mapWorkflowActionToStatus, serializeWorkflow } from '@/app/api/workflows/_utils'

type RouteContext = {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { workflowId } = await context.params
    const existing = await prisma.workflow.findUnique({ where: { id: workflowId } })

    if (!existing) return notFoundResponse('Workflow not found')

    const body = await request.json()
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : ''
    const nextStatus = mapWorkflowActionToStatus(action)

    if (!nextStatus) {
      return errorResponse('Invalid workflow action', 400)
    }

    const now = new Date()
    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: nextStatus,
        startedAt:
          action === 'start' || action === 'resume'
            ? existing.startedAt || now
            : existing.startedAt,
        completedAt: action === 'stop' ? now : null,
      },
    })

    return successResponse(serializeWorkflow(workflow), 'Workflow action applied successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Control workflow error:', error)
    return errorResponse('Internal server error', 500)
  }
}

