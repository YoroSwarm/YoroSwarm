import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { getLeadAgent, mapPriorityToNumber, requireTokenPayload, serializeTask } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params

    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const tasks = await prisma.teamLeadTask.findMany({
      where: { assigneeId: agent.id },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return successResponse({
      agent_id: agent.id,
      current_task_id: tasks.find((task) => task.status === 'IN_PROGRESS')?.id || null,
      tasks: tasks.map(serializeTask),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get agent tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const body = await request.json()
    if (!body.title) {
      return errorResponse('Task title is required', 400)
    }

    const creator = await getLeadAgent(agent.teamId)
    if (!creator) {
      return errorResponse('No creator agent available', 400)
    }

    const task = await prisma.teamLeadTask.create({
      data: {
        title: body.title,
        description: body.description,
        priority: mapPriorityToNumber(body.priority),
        assigneeId: agent.id,
        creatorId: creator.id,
        teamId: agent.teamId,
        status: 'ASSIGNED',
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    return successResponse({
      task_id: task.id,
      agent_id: agent.id,
      status: 'assigned',
      message: 'Task assigned to agent successfully',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Assign task to agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
