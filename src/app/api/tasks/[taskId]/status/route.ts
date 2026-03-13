import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapApiStatusToDb, requireTokenPayload, serializeTask } from '@/lib/server/swarm'
import { transitionTaskStatus } from '@/lib/server/task-orchestrator'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params

    const task = await prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: { assignee: true },
    })

    if (!task) {
      return notFoundResponse('Task not found')
    }

    const body = await request.json()
    const newStatus = mapApiStatusToDb(body.status)

    // 确定执行者（默认是 assignee，如果没有则是 body 中指定的 actor）
    const actorId = body.actor_id || task.assigneeId || task.creatorId

    // 使用编排器进行状态流转
    const result = await transitionTaskStatus(taskId, newStatus, actorId)

    return successResponse({
      task: serializeTask(result.task),
      unlocked_tasks: result.unlockedTasks,
      notifications: result.notifications,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    if (error instanceof Error && error.message.includes('INVALID_STATUS_TRANSITION')) {
      return errorResponse(error.message, 400)
    }

    if (error instanceof Error && error.message === 'DEPENDENCIES_NOT_COMPLETED') {
      return errorResponse('Cannot start task: dependencies not completed', 400)
    }

    console.error('Update task status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
