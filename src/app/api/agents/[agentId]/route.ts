import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, serializeAgent } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

async function getAgent(agentId: string) {
  return prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      tasks: true,
    },
  })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await getAgent(agentId)

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    return successResponse(serializeAgent(agent))
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await getAgent(agentId)

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const body = await request.json()
    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: {
        name: body.name ?? agent.name,
        role: body.role ?? agent.role,
        description: body.description ?? agent.description,
        capabilities: body.capabilities ? JSON.stringify(body.capabilities) : agent.capabilities,
        config: body.config ? JSON.stringify(body.config) : agent.config,
      },
      include: {
        tasks: true,
      },
    })

    return successResponse(serializeAgent(updated), 'Agent updated successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Update agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const agent = await getAgent(agentId)

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const activeTasks = agent.tasks.filter((task) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status))
    if (activeTasks.length > 0) {
      await prisma.teamLeadTask.updateMany({
        where: { assigneeId: agent.id },
        data: { assigneeId: null, status: 'PENDING' },
      })
    }

    await prisma.agent.delete({ where: { id: agent.id } })
    return successResponse({ deleted: true }, 'Agent deleted successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Delete agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
