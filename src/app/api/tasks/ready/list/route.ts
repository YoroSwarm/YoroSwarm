import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveTeam, serializeTask } from '@/lib/server/swarm'

export async function GET(request: Request) {
  try {
    await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('team_id') || searchParams.get('teamId')
    const team = await resolveTeam(teamId)

    const tasks = await prisma.teamLeadTask.findMany({
      where: {
        ...(team?.id ? { teamId: team.id } : {}),
        status: 'PENDING',
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    })

    const readyTasks = tasks.filter((task) => !task.parentId || task.parent?.status === 'COMPLETED')
    const serialized = readyTasks.map(serializeTask)

    return successResponse({
      tasks: serialized,
      count: serialized.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get ready tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
}
