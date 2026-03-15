import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { parseJson, requireTokenPayload, serializeRealtimeAgentStatus, serializeRealtimeTaskUpdate } from '@/lib/server/swarm'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { activateAssignedTask } from '@/lib/server/task-activation'

type RouteContext = {
  params: Promise<{ taskId: string }>
}

function scoreAgent(agent: { capabilities: string | null; tasks: unknown[] }, description: string) {
  const capabilities = parseJson<string[]>(agent.capabilities, [])
  const text = description.toLowerCase()
  const capabilityScore = capabilities.filter((capability) => text.includes(capability.toLowerCase())).length
  const loadPenalty = agent.tasks.length
  return capabilityScore * 10 - loadPenalty
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { taskId } = await context.params
    const task = await prisma.teamLeadTask.findUnique({ where: { id: taskId } })

    if (!task) {
      return notFoundResponse('Task not found')
    }

    const body = await request.json()
    const strategy = body.strategy || (body.agent_id ? 'manual' : 'auto')
    let agentId = body.agent_id as string | undefined

    if (!agentId) {
      const agents = await prisma.agent.findMany({
        where: {
          swarmSessionId: task.swarmSessionId,
          role: { not: 'team_lead' },
        },
        include: {
          tasks: {
            where: {
              status: {
                in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'],
              },
            },
          },
        },
      })

      if (agents.length === 0) {
        return errorResponse('No available agents for assignment', 400)
      }

      const selectedAgent = strategy === 'capability_match'
        ? agents.sort((a, b) => scoreAgent(b, task.description || task.title) - scoreAgent(a, task.description || task.title))[0]
        : agents.sort((a, b) => a.tasks.length - b.tasks.length)[0]

      agentId = selectedAgent.id
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    if (agent.swarmSessionId !== task.swarmSessionId) {
      return errorResponse('Agent and task must belong to the same swarm session', 400)
    }

    if (agent.role === 'team_lead') {
      return errorResponse('Team Lead cannot be assigned execution tasks', 400)
    }

    const updatedTask = await prisma.teamLeadTask.update({
      where: { id: task.id },
      data: {
        assigneeId: agent.id,
        status: task.status === 'IN_PROGRESS' ? task.status : 'ASSIGNED',
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    const refreshedAgent = await prisma.agent.findUnique({
      where: { id: agent.id },
      include: { tasks: true },
    })

    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: serializeRealtimeTaskUpdate(updatedTask, `任务已分配给 ${agent.name}`),
      },
      { sessionId: task.swarmSessionId }
    )

    if (refreshedAgent) {
      publishRealtimeMessage(
        {
          type: 'agent_status',
          payload: serializeRealtimeAgentStatus(refreshedAgent),
        },
        { sessionId: refreshedAgent.swarmSessionId }
      )
    }

    await appendAgentContextEntry({
      swarmSessionId: task.swarmSessionId,
      agentId: agent.id,
      sourceType: 'task',
      sourceId: task.id,
      entryType: 'task_brief',
      content: `${task.title}\n\n${task.description || ''}`.trim(),
      metadata: {
        assignmentStrategy: strategy,
      },
    })

    const taskWithDeps = await prisma.teamLeadTask.findUnique({
      where: { id: task.id },
      include: {
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    })

    const hasPendingDependencies = Boolean(
      taskWithDeps?.dependencies.some((dependency) => dependency.dependsOnTask.status !== 'COMPLETED')
    )

    if (!hasPendingDependencies) {
      const leadAgent = await prisma.agent.findFirst({
        where: { swarmSessionId: task.swarmSessionId, kind: 'LEAD' },
        select: { id: true },
      })

      if (leadAgent?.id) {
        const teammateActiveTask = await prisma.teamLeadTask.findFirst({
          where: {
            swarmSessionId: task.swarmSessionId,
            assigneeId: agent.id,
            status: 'IN_PROGRESS',
            id: { not: task.id },
          },
          select: { id: true, title: true },
        })

        await activateAssignedTask({
          swarmSessionId: task.swarmSessionId,
          leadAgentId: leadAgent.id,
          taskId: task.id,
          teammateId: agent.id,
          reason: 'assignment',
          queuedBehindTaskId: teammateActiveTask?.id,
          queuedBehindTaskTitle: teammateActiveTask?.title,
        })
      }
    }

    return successResponse({
      task_id: task.id,
      assigned_agent_id: agent.id,
      agent_name: agent.name,
      assignment_strategy: strategy,
      success: true,
      message: hasPendingDependencies ? 'Task assigned and waiting for prerequisites' : 'Task assigned successfully',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Assign task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
