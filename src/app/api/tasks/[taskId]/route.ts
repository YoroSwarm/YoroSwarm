import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapPriorityToNumber, requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

async function getTask(taskId: string) {
  return prisma.teamLeadTask.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      parent: true,
      subtasks: true,
    },
  })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const task = await getTask(taskId)

    if (!task) {
      return notFoundResponse('Task not found')
    }

    return successResponse(serializeTask(task))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get task error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const task = await getTask(taskId)

    if (!task) {
      return notFoundResponse('Task not found')
    }

    const body = await request.json()
    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        title: body.title ?? task.title,
        description: body.description ?? task.description,
        priority: body.priority ? mapPriorityToNumber(body.priority) : task.priority,
        dueDate: body.deadline ? new Date(body.deadline) : body.deadline === null ? null : task.dueDate,
        assigneeId: body.assigned_agent_id ?? task.assigneeId,
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    return successResponse(serializeTask(updated), 'Task updated successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update task error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const task = await getTask(taskId)

    if (!task) {
      return notFoundResponse('Task not found')
    }

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    if (!force && task.subtasks.length > 0) {
      return errorResponse('Task has dependent subtasks; use force=true to delete', 409)
    }

    await prisma.teamLeadTask.delete({ where: { id: taskId } })
    return successResponse({ deleted: true }, 'Task deleted successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Delete task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
