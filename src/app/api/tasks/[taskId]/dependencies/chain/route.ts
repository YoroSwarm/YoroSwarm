import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapDbStatusToApi, requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') === 'down' ? 'down' : 'up'

    const rootTask = await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
    if (!rootTask) {
      return notFoundResponse('Task not found')
    }

    const chain: Array<{ id: string; title: string; status: string; is_blocking: boolean }> = []

    if (direction === 'up') {
      let cursor = rootTask.parentId
      while (cursor) {
        const current = await prisma.teamLeadTask.findUnique({ where: { id: cursor } })
        if (!current) break
        chain.push({
          id: current.id,
          title: current.title,
          status: mapDbStatusToApi(current.status),
          is_blocking: current.status !== 'COMPLETED',
        })
        cursor = current.parentId
      }
    } else {
      const queue = [rootTask.id]
      while (queue.length > 0) {
        const currentId = queue.shift() as string
        const subtasks = await prisma.teamLeadTask.findMany({ where: { parentId: currentId } })
        for (const subtask of subtasks) {
          chain.push({
            id: subtask.id,
            title: subtask.title,
            status: mapDbStatusToApi(subtask.status),
            is_blocking: subtask.status !== 'COMPLETED',
          })
          queue.push(subtask.id)
        }
      }
    }

    return successResponse({
      task_id: taskId,
      direction,
      chain,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get dependency chain error:', error)
    return errorResponse('Internal server error', 500)
  }
}
