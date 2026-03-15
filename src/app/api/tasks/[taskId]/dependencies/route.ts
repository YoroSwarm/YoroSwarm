import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const body = await request.json()
    const dependencyId = body.dependency_id as string | undefined

    if (!dependencyId) {
      return errorResponse('dependency_id is required', 400)
    }

    const [task, dependency] = await Promise.all([
      prisma.teamLeadTask.findUnique({ where: { id: taskId } }),
      prisma.teamLeadTask.findUnique({ where: { id: dependencyId } }),
    ])

    if (!task || !dependency) {
      return notFoundResponse('Task or dependency not found')
    }

    if (task.swarmSessionId !== dependency.swarmSessionId) {
      return errorResponse('Task and dependency must belong to the same swarm session', 400)
    }

    if (task.id === dependency.id) {
      return errorResponse('Task cannot depend on itself', 400)
    }

    await prisma.taskDependency.upsert({
      where: {
        taskId_dependsOnTaskId: {
          taskId,
          dependsOnTaskId: dependencyId,
        },
      },
      update: {
        dependencyType: 'blocks',
      },
      create: {
        swarmSessionId: task.swarmSessionId,
        taskId,
        dependsOnTaskId: dependencyId,
        dependencyType: 'blocks',
      },
    })

    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        parentId: task.parentId || dependencyId,
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

    return successResponse(serializeTask(updated), 'Dependency added successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Add dependency error:', error)
    return errorResponse('Internal server error', 500)
  }
}
