import prisma from '@/lib/db'
import { notFoundResponse, successResponse, unauthorizedResponse, errorResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function PUT(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params

    const task = await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return notFoundResponse('Task not found')
    }

    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        assigneeId: null,
        status: task.status === 'IN_PROGRESS' ? task.status : 'PENDING',
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    })

    return successResponse(serializeTask(updated), 'Task unassigned successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Unassign task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
