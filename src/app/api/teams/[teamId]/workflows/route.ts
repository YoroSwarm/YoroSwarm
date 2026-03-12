import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveTeam } from '@/lib/server/swarm'
import { serializeWorkflow } from '@/app/api/workflows/_utils'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)
    if (!team) return notFoundResponse('Team not found')

    const workflows = await prisma.workflow.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: 'desc' },
    })

    const items = workflows.map(serializeWorkflow)
    return successResponse({ items, total: items.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse('Authentication required')
    console.error('Get workflows error:', error)
    return errorResponse('Internal server error', 500)
  }
}


export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)
    if (!team) return notFoundResponse('Team not found')

    const body = await request.json()
    if (!body.name) return errorResponse('Workflow name is required', 400)

    const workflow = await prisma.workflow.create({
      data: {
        name: body.name,
        description: body.description,
        teamId: team.id,
        definition: JSON.stringify(body.definition || {}),
      },
    })

    return successResponse(serializeWorkflow(workflow), 'Workflow created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse('Authentication required')
    console.error('Create workflow error:', error)
    return errorResponse('Internal server error', 500)
  }
}
