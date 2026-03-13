import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope, serializeTask } from '@/lib/server/swarm'

export async function GET(request: Request) {
  try {
    await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarm_session_id') || searchParams.get('swarmSessionId')

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const tasks = await prisma.teamLeadTask.findMany({
      where: {
        swarmSessionId: session.id,
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
