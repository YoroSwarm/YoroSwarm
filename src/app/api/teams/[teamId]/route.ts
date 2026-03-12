import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveTeam } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

function parseConfig(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function buildTeamPayload(team: Awaited<ReturnType<typeof prisma.team.findFirst>> & {
  agents: Array<{ status: 'IDLE' | 'BUSY' | 'OFFLINE' | 'ERROR' }>
  tasks: Array<{ status: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' }>
  workflows: Array<{ id: string }>
}) {
  const totalAgents = team.agents.length
  const activeAgents = team.agents.filter((agent) => agent.status !== 'OFFLINE').length
  const totalTasks = team.tasks.length
  const completedTasks = team.tasks.filter((task) => task.status === 'COMPLETED').length
  const pendingTasks = team.tasks.filter((task) => task.status === 'PENDING' || task.status === 'ASSIGNED').length
  const inProgressTasks = team.tasks.filter((task) => task.status === 'IN_PROGRESS').length
  const failedTasks = team.tasks.filter((task) => task.status === 'FAILED').length

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    created_at: team.createdAt.toISOString(),
    updated_at: team.updatedAt.toISOString(),
    created_by: team.createdBy,
    config: parseConfig(team.config),
    agents: team.agents,
    tasks: team.tasks,
    workflows: team.workflows,
    stats: {
      total_agents: totalAgents,
      active_agents: activeAgents,
      total_tasks: totalTasks,
      pending_tasks: pendingTasks,
      in_progress_tasks: inProgressTasks,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
    },
    agent_count: totalAgents,
    task_count: totalTasks,
    completed_tasks: completedTasks,
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params

    const team = await resolveTeam(teamId)
    if (!team) {
      return notFoundResponse('Team not found')
    }

    const fullTeam = await prisma.team.findUnique({
      where: { id: team.id },
      include: {
        agents: true,
        tasks: true,
        workflows: true,
      },
    })

    if (!fullTeam) {
      return notFoundResponse('Team not found')
    }

    return successResponse(buildTeamPayload(fullTeam))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get team error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)

    if (!team) {
      return notFoundResponse('Team not found')
    }

    const body = await request.json()
    const updated = await prisma.team.update({
      where: { id: team.id },
      data: {
        name: body.name ?? team.name,
        description: body.description ?? team.description,
        config: JSON.stringify({
          ...parseConfig(team.config),
          ...(body.config || {}),
        }),
      },
      include: {
        agents: true,
        tasks: true,
        workflows: true,
      },
    })

    return successResponse(buildTeamPayload(updated), 'Team updated successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update team error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)

    if (!team) {
      return notFoundResponse('Team not found')
    }

    await prisma.team.delete({ where: { id: team.id } })
    return successResponse({ deleted: true }, 'Team deleted successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Delete team error:', error)
    return errorResponse('Internal server error', 500)
  }
}
