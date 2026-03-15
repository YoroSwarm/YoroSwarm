import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { getLeadAgent, mapPriorityToNumber, requireTokenPayload, serializeTask } from '@/lib/server/swarm';
import { buildSessionTaskData } from '@/lib/server/swarm-session';
import { appendAgentContextEntry } from '@/lib/server/agent-context';

type RouteContext = {
  params: Promise<{ id: string }>;
}

async function verifySessionOwnership(sessionId: string, userId: string) {
  return prisma.swarmSession.findFirst({ where: { id: sessionId, userId } });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const session = await verifySessionOwnership(id, payload.userId);

    if (!session) {
      return notFoundResponse('Swarm session not found');
    }

    const tasks = await prisma.teamLeadTask.findMany({
      where: { swarmSessionId: id },
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
    });

    return successResponse({
      items: tasks.map(serializeTask),
      total: tasks.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('List session tasks error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const session = await verifySessionOwnership(id, payload.userId);

    if (!session) {
      return notFoundResponse('Swarm session not found');
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return errorResponse('Task title is required', 400);
    }

    const creator = await getLeadAgent({ swarmSessionId: id });
    if (!creator) {
      return errorResponse('Lead agent not found', 400);
    }

    const assigneeId = body.assigneeId || body.assigned_agent_id || body.agent_id;
    const task = await prisma.teamLeadTask.create({
      data: buildSessionTaskData({
        swarmSessionId: id,
        creatorId: creator.id,
        title,
        description: typeof body.description === 'string' ? body.description : null,
        priority: mapPriorityToNumber(body.priority),
        assigneeId,
        parentId: body.parentId || body.dependency_parent_id || null,
        dueDate: body.deadline ? new Date(body.deadline) : null,
      }),
      include: {
        assignee: true,
        parent: true,
        subtasks: true,
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    });

    const dependencyIds = Array.isArray(body.dependency_ids)
      ? body.dependency_ids.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : body.parentId || body.dependency_parent_id
        ? [body.parentId || body.dependency_parent_id]
        : [];

    if (dependencyIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: dependencyIds
          .filter((dependencyId: string, index: number, list: string[]) => list.indexOf(dependencyId) === index)
          .filter((dependencyId: string) => dependencyId !== task.id)
          .map((dependencyId: string) => ({
            swarmSessionId: id,
            taskId: task.id,
            dependsOnTaskId: dependencyId,
            dependencyType: 'blocks',
          })),
      });
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
    });

    if (!hydratedTask) {
      return errorResponse('Task created but could not be reloaded', 500);
    }

    if (assigneeId) {
      await appendAgentContextEntry({
        swarmSessionId: id,
        agentId: assigneeId,
        sourceType: 'task',
        sourceId: task.id,
        entryType: 'task_brief',
        content: `${task.title}\n\n${task.description || ''}`.trim(),
      });
    }

    return successResponse(serializeTask(hydratedTask), 'Task created successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Create session task error:', error);
    return errorResponse('Internal server error', 500);
  }
}
