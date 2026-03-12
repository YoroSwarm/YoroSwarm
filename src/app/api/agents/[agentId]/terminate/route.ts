import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = { params: Promise<{ agentId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return notFoundResponse('Agent not found')

    await prisma.teamLeadTask.updateMany({
      where: { assigneeId: agent.id, status: { in: ['PENDING', 'ASSIGNED'] } },
      data: { assigneeId: null, status: 'PENDING' },
    })
    await prisma.agent.delete({ where: { id: agentId } })

    return successResponse({ agent_id: agentId, action: 'terminate', success: true, message: 'Agent terminated' })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse('Authentication required')
    console.error('Terminate agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
