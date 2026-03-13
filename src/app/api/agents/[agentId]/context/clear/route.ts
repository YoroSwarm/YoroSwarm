import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { clearAgentContext } from '@/lib/server/agent-context'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params

    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const deleted = await clearAgentContext(agentId)

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        config: JSON.stringify({
          ...JSON.parse(agent.config || '{}'),
          contextClearedAt: new Date().toISOString(),
        }),
      },
    })

    return successResponse({
      agent_id: agentId,
      action: 'clear_context',
      deleted_entries: deleted.count,
      success: true,
      message: 'Agent context cleared',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Clear agent context error:', error)
    return errorResponse('Internal server error', 500)
  }
}
