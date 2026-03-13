import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeRealtimeAgentStatus } from '@/lib/server/swarm'
import { publishRealtimeMessage } from '@/app/api/ws/route'

type RouteContext = { params: Promise<{ agentId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return notFoundResponse('Agent not found')

    const updated = await prisma.agent.update({ where: { id: agentId }, data: { status: 'OFFLINE' }, include: { tasks: true } })

    publishRealtimeMessage(
      {
        type: 'agent_status',
        payload: serializeRealtimeAgentStatus(updated),
      },
      { sessionId: updated.swarmSessionId }
    )

    return successResponse({ agent_id: agentId, action: 'pause', success: true, message: 'Agent paused' })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse('Authentication required')
    console.error('Pause agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
