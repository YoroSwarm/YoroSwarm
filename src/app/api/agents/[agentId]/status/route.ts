import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { mapAgentStatusToApi, mapApiAgentStatusToDb, requireTokenPayload, serializeRealtimeAgentStatus } from '@/lib/server/swarm'
import { publishRealtimeMessage } from '@/app/api/ws/route'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { tasks: true },
    })

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    return successResponse({
      agent_id: agent.id,
      name: agent.name,
      agent_type: agent.role,
      status: mapAgentStatusToApi(agent.status),
      current_task_id: agent.tasks.find((task) => task.status === 'IN_PROGRESS')?.id,
      total_tasks_completed: agent.tasks.filter((task) => task.status === 'COMPLETED').length,
      total_tasks_failed: agent.tasks.filter((task) => task.status === 'FAILED').length,
      last_active_at: agent.updatedAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get agent status error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const body = await request.json()

    const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { tasks: true } })
    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { status: mapApiAgentStatusToDb(body.status) },
      include: { tasks: true },
    })

    publishRealtimeMessage(
      {
        type: 'agent_status',
        payload: serializeRealtimeAgentStatus(updated),
      },
      { sessionId: updated.swarmSessionId }
    )

    return successResponse({
      agent_id: updated.id,
      name: updated.name,
      agent_type: updated.role,
      status: mapAgentStatusToApi(updated.status),
      current_task_id: updated.tasks.find((task) => task.status === 'IN_PROGRESS')?.id,
      total_tasks_completed: updated.tasks.filter((task) => task.status === 'COMPLETED').length,
      total_tasks_failed: updated.tasks.filter((task) => task.status === 'FAILED').length,
      last_active_at: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update agent status error:', error)
    return errorResponse('Internal server error', 500)
  }
}
