import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { serializeWorkflow } from '@/app/api/workflows/_utils'

type RouteContext = {
  params: Promise<{ workflowId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { workflowId } = await context.params
    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })

    if (!workflow) return notFoundResponse('Workflow not found')

    return successResponse(serializeWorkflow(workflow))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get workflow progress error:', error)
    return errorResponse('Internal server error', 500)
  }
}
