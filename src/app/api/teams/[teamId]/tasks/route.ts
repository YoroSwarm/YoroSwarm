import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import {
  getLeadAgent,
  mapPriorityToNumber,
  mapApiStatusToDb,
  requireTokenPayload,
  resolveTeam,
  serializeTask,
} from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { teamId } = await context.params
    const team = await resolveTeam(teamId)

    if (!team) {
      return notFoundResponse('Team not found')
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const tasks = await prisma.teamLeadTask.findMany({
      where: {
        teamId: team.id,
        ...(status ? { status: mapApiStatusToDb(status) } : {}),
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const items = tasks.map(serializeTask)
    return successResponse({ items, total: items.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get team tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
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
    if (!body.title) {
      return errorResponse('Task title is required', 400)
    }

    const creator = await getLeadAgent(team.id)
    if (!creator) {
      return errorResponse('No agent available to create tasks for this team', 400)
    }

    const task = await prisma.teamLeadTask.create({
      data: {
        title: body.title,
        description: body.description,
        priority: mapPriorityToNumber(body.priority),
        assigneeId: body.assigned_agent_id || body.agent_id || undefined,
        creatorId: creator.id,
        teamId: team.id,
        parentId: body.dependency_parent_id || undefined,
        dueDate: body.deadline ? new Date(body.deadline) : null,
        status: body.assigned_agent_id || body.agent_id ? 'ASSIGNED' : 'PENDING',
      },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
      },
    })

    return successResponse(serializeTask(task), 'Task created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create team task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
