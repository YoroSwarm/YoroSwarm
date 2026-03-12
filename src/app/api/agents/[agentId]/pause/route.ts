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

    await prisma.agent.update({ where: { id: agentId }, data: { status: 'OFFLINE' } })
    return successResponse({ agent_id: agentId, action: 'pause', success: true, message: 'Agent paused' })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse('Authentication required')
    console.error('Pause agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
