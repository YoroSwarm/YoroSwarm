import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveTeam, serializeAgent } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)

    if (!team) {
      return notFoundResponse('Team not found')
    }

    const body = await request.json()
    if (!body.name || !body.role) {
      return errorResponse('Name and role are required', 400)
    }

    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        role: body.role,
        description: body.description,
        teamId: team.id,
        capabilities: JSON.stringify(body.capabilities || []),
        config: JSON.stringify(body.config || {}),
      },
      include: {
        tasks: true,
      },
    })

    return successResponse(serializeAgent(agent), 'Agent created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create team agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
