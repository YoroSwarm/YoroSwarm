import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapApiStatusToDb, requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const tasks = await prisma.teamLeadTask.findMany({
      where: {
        assigneeId: agentId,
        ...(status ? { status: mapApiStatusToDb(status) } : {}),
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return successResponse(tasks.map(serializeTask))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get agent tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
}
