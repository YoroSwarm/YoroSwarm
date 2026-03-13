import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function PUT(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params

    const task = await prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: { parent: true },
    })

    if (!task) {
      return notFoundResponse('Task not found')
    }

    if (task.parentId && task.parent?.status !== 'COMPLETED') {
      return errorResponse('Task is still blocked by dependency', 409)
    }

    const fallbackAgent = await prisma.agent.findFirst({
      where: { swarmSessionId: task.swarmSessionId },
      orderBy: { createdAt: 'asc' },
    })

    if (!fallbackAgent) {
      return errorResponse('No agent available to claim the task', 400)
    }

    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        assigneeId: task.assigneeId || fallbackAgent.id,
        status: 'ASSIGNED',
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    return successResponse(serializeTask(updated), 'Task claimed successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Claim task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
