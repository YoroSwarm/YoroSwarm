import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { mapApiStatusToDb, mapPriorityToNumber, serializeTask, getLeadAgent, resolveSessionScope } from '@/lib/server/swarm'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { buildSessionTaskData } from '@/lib/server/swarm-session'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const assigneeId = searchParams.get('assigneeId') || searchParams.get('assignee_id')
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const tasks = await prisma.teamLeadTask.findMany({
      where: {
        swarmSessionId: session.id,
        ...(assigneeId ? { assigneeId } : {}),
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
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const items = tasks.map(serializeTask)
    return successResponse({ items, total: items.length })
  } catch (error) {
    console.error('List tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description : undefined
    const priority = body.priority
    const assigneeId = body.assigneeId || body.assigned_agent_id || body.agent_id
    const swarmSessionId = body.swarmSessionId || body.swarm_session_id
    const parentId = body.parentId || body.dependency_parent_id || body.dependency_id
    const dueDate = body.dueDate || body.deadline

    if (!title) {
      return errorResponse('Task title is required', 400)
    }

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const creator = await getLeadAgent({ swarmSessionId: session.id })
    if (!creator) {
      return errorResponse('No creator agent available', 400)
    }

    const task = await prisma.teamLeadTask.create({
      data: buildSessionTaskData({
        swarmSessionId: session.id,
        creatorId: creator.id,
        title,
        description,
        priority: mapPriorityToNumber(priority),
        assigneeId,
        parentId: parentId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      }),
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    })

    const dependencyIds = Array.isArray(body.dependency_ids)
      ? body.dependency_ids.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : parentId
        ? [parentId]
        : []

    if (dependencyIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: dependencyIds
          .filter((dependencyId: string, index: number, list: string[]) => list.indexOf(dependencyId) === index)
          .filter((dependencyId: string) => dependencyId !== task.id)
          .map((dependencyId: string) => ({
            swarmSessionId: session.id,
            taskId: task.id,
            dependsOnTaskId: dependencyId,
            dependencyType: 'blocks',
          })),
      })
    }

    const hydratedTask = await prisma.teamLeadTask.findUnique({
      where: { id: task.id },
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    })

    if (!hydratedTask) {
      return errorResponse('Task created but could not be reloaded', 500)
    }

    if (assigneeId) {
      await appendAgentContextEntry({
        swarmSessionId: session.id,
        agentId: assigneeId,
        sourceType: 'task',
        sourceId: task.id,
        entryType: 'task_brief',
        content: `${task.title}\n\n${task.description || ''}`.trim(),
        metadata: {
          priority: task.priority,
          creatorId: creator.id,
        },
      })
    }

    return successResponse(serializeTask(hydratedTask), 'Task created successfully')
  } catch (error) {
    console.error('Create task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
