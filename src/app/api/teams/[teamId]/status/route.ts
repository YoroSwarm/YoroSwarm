import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import {
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/lib/api/response'
import { cookies } from 'next/headers'

type RouteContext = {
  params: Promise<{
    teamId: string
  }>
}

function buildEmptyStatus(teamId: string) {
  return {
    team_id: teamId,
    total_agents: 0,
    active_agents: 0,
    busy_agents: 0,
    offline_agents: 0,
    total_tasks: 0,
    pending_tasks: 0,
    in_progress_tasks: 0,
    completed_tasks: 0,
    failed_tasks: 0,
    average_load: 0,
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { teamId: requestedTeamId } = await context.params

    const team = requestedTeamId === 'default'
      ? await prisma.team.findFirst({ orderBy: { createdAt: 'asc' } })
      : await prisma.team.findUnique({ where: { id: requestedTeamId } })

    if (!team) {
      if (requestedTeamId === 'default') {
        return successResponse(buildEmptyStatus(requestedTeamId))
      }

      return notFoundResponse('Team not found')
    }

    const [agents, tasks] = await Promise.all([
      prisma.agent.findMany({
        where: { teamId: team.id },
        select: { status: true },
      }),
      prisma.teamLeadTask.findMany({
        where: { teamId: team.id },
        select: { status: true, assigneeId: true },
      }),
    ])

    const totalAgents = agents.length
    const busyAgents = agents.filter((agent) => agent.status === 'BUSY').length
    const offlineAgents = agents.filter((agent) => agent.status === 'OFFLINE').length
    const activeAgents = agents.filter((agent) => agent.status !== 'OFFLINE').length

    const totalTasks = tasks.length
    const pendingTasks = tasks.filter((task) => task.status === 'PENDING' || task.status === 'ASSIGNED').length
    const inProgressTasks = tasks.filter((task) => task.status === 'IN_PROGRESS').length
    const completedTasks = tasks.filter((task) => task.status === 'COMPLETED').length
    const failedTasks = tasks.filter((task) => task.status === 'FAILED').length
    const assignedTasks = tasks.filter((task) => task.assigneeId).length
    const averageLoad = totalAgents === 0 ? 0 : Number((assignedTasks / totalAgents).toFixed(2))

    return successResponse({
      team_id: team.id,
      total_agents: totalAgents,
      active_agents: activeAgents,
      busy_agents: busyAgents,
      offline_agents: offlineAgents,
      total_tasks: totalTasks,
      pending_tasks: pendingTasks,
      in_progress_tasks: inProgressTasks,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
      average_load: averageLoad,
    })
  } catch (error) {
    console.error('Get team status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
