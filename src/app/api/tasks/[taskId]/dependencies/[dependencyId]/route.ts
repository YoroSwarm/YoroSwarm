import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string; dependencyId: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId, dependencyId } = await context.params

    const task = await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return notFoundResponse('Task not found')
    }

    if (task.parentId !== dependencyId) {
      const existing = await prisma.taskDependency.findUnique({
        where: {
          taskId_dependsOnTaskId: {
            taskId,
            dependsOnTaskId: dependencyId,
          },
        },
      })

      if (!existing) {
        return errorResponse('Specified dependency is not attached to this task', 409)
      }
    }

    await prisma.taskDependency.deleteMany({
      where: {
        taskId,
        dependsOnTaskId: dependencyId,
      },
    })

    const remainingDependencies = await prisma.taskDependency.findMany({
      where: { taskId },
      select: { dependsOnTaskId: true },
    })

    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: { parentId: remainingDependencies[0]?.dependsOnTaskId || null },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    })

    return successResponse(serializeTask(updated), 'Dependency removed successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Remove dependency error:', error)
    return errorResponse('Internal server error', 500)
  }
}
