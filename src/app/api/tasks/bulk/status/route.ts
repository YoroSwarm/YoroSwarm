import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapApiStatusToDb, requireTokenPayload } from '@/lib/server/swarm'

export async function POST(request: NextRequest) {
  try {
    await requireTokenPayload()
    const body = await request.json()
    const taskIds = Array.isArray(body.task_ids) ? body.task_ids as string[] : []

    if (taskIds.length === 0) {
      return errorResponse('task_ids is required', 400)
    }

    const status = mapApiStatusToDb(body.status)
    const updated: string[] = []
    const failed: string[] = []

    for (const taskId of taskIds) {
      try {
        await prisma.teamLeadTask.update({
          where: { id: taskId },
          data: { status },
        })
        updated.push(taskId)
      } catch {
        failed.push(taskId)
      }
    }

    return successResponse({
      updated,
      failed,
      updated_count: updated.length,
      failed_count: failed.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Bulk update task status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
