import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { listUnlockedSubtasks, mapApiStatusToDb, requireTokenPayload, serializeRealtimeAgentStatus, serializeRealtimeTaskUpdate, serializeTask } from '@/lib/server/swarm'
import { publishRealtimeMessage } from '@/app/api/ws/route'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const task = await prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    if (!task) {
      return notFoundResponse('Task not found')
    }

    const body = await request.json()
    const status = mapApiStatusToDb(body.status)
    const now = new Date()

    const updated = await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        status,
        startedAt: status === 'IN_PROGRESS' ? task.startedAt || now : task.startedAt,
        completedAt: status === 'COMPLETED' ? now : status === 'FAILED' || status === 'CANCELLED' ? task.completedAt || now : null,
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    const unlockedTasks = status === 'COMPLETED' ? await listUnlockedSubtasks(taskId) : []

    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: serializeRealtimeTaskUpdate(updated, `任务状态更新为 ${body.status}`),
      },
      { sessionId: updated.swarmSessionId }
    )

    if (updated.assigneeId) {
      const assignee = await prisma.agent.findUnique({
        where: { id: updated.assigneeId },
        include: { tasks: true },
      })

      if (assignee) {
        publishRealtimeMessage(
          {
            type: 'agent_status',
            payload: serializeRealtimeAgentStatus(assignee),
          },
          { sessionId: assignee.swarmSessionId }
        )
      }
    }

    return successResponse({
      task: serializeTask(updated),
      unlocked_tasks: unlockedTasks,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update task status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
