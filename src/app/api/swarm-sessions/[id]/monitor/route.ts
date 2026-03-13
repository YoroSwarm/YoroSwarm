import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';

type RouteContext = {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;

    const [session, contextCount, internalThreads, internalMessages] = await Promise.all([
      prisma.swarmSession.findFirst({
        where: { id, userId: payload.userId },
        include: {
          agents: true,
          tasks: true,
          externalConversations: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      }),
      prisma.agentContextEntry.count({ where: { swarmSessionId: id } }),
      prisma.internalThread.count({ where: { swarmSessionId: id } }),
      prisma.internalMessage.count({ where: { swarmSessionId: id } }),
    ]);

    if (!session) {
      return notFoundResponse('Swarm session not found');
    }

    const metrics = {
      total_agents: session.agents.length,
      active_agents: session.agents.filter((agent) => agent.status !== 'OFFLINE').length,
      busy_agents: session.agents.filter((agent) => agent.status === 'BUSY').length,
      total_tasks: session.tasks.length,
      pending_tasks: session.tasks.filter((task) => task.status === 'PENDING' || task.status === 'ASSIGNED').length,
      in_progress_tasks: session.tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      completed_tasks: session.tasks.filter((task) => task.status === 'COMPLETED').length,
      failed_tasks: session.tasks.filter((task) => task.status === 'FAILED' || task.status === 'CANCELLED').length,
      context_entries: contextCount,
      internal_threads: internalThreads,
      internal_messages: internalMessages,
    };

    return successResponse({
      session: serializeSwarmSession(session),
      metrics,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Get swarm session monitor error:', error);
    return errorResponse('Internal server error', 500);
  }
}
