import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapAgentStatusToApi, parseJson, requireTokenPayload, resolveTeam } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)

    if (!team) {
      return notFoundResponse('Team not found')
    }

    const agents = await prisma.agent.findMany({
      where: { teamId: team.id },
      include: {
        tasks: {
          where: {
            status: {
              in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'],
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const items = agents.map((agent) => {
      const currentLoad = agent.tasks.length
      const maxLoad = 4
      const availabilityScore = Number(Math.max(0, 1 - currentLoad / maxLoad).toFixed(2))

      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        status: mapAgentStatusToApi(agent.status),
        team_id: agent.teamId,
        capabilities: parseJson<string[]>(agent.capabilities, []),
        config: parseJson<Record<string, unknown>>(agent.config, {}),
        current_load: currentLoad,
        max_load: maxLoad,
        availability_score: availabilityScore,
        is_available: currentLoad < maxLoad && agent.status !== 'OFFLINE',
        current_task: agent.tasks[0]
          ? {
              id: agent.tasks[0].id,
              title: agent.tasks[0].title,
            }
          : null,
        created_at: agent.createdAt.toISOString(),
        updated_at: agent.updatedAt.toISOString(),
        last_active_at: agent.updatedAt.toISOString(),
      }
    })

    return successResponse({ items, total: items.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get team members error:', error)
    return errorResponse('Internal server error', 500)
  }
}
