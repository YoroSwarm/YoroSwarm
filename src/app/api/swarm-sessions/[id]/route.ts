import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';

type RouteContext = {
  params: Promise<{ id: string }>;
}

async function getScopedSession(sessionId: string, userId: string) {
  return prisma.swarmSession.findFirst({
    where: { id: sessionId, userId },
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
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const session = await getScopedSession(id, payload.userId);

    if (!session) {
      return notFoundResponse('Swarm session not found');
    }

    return successResponse(serializeSwarmSession(session));
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Get swarm session error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const body = await request.json();
    const existing = await getScopedSession(id, payload.userId);

    if (!existing) {
      return notFoundResponse('Swarm session not found');
    }

    await prisma.swarmSession.update({
      where: { id },
      data: {
        title: typeof body.title === 'string' ? body.title.trim() : undefined,
        goal: typeof body.goal === 'string' ? body.goal.trim() : undefined,
        mode: typeof body.mode === 'string' ? body.mode : undefined,
        status: typeof body.status === 'string' ? body.status.toUpperCase() : undefined,
        archivedAt: body.status === 'archived' ? new Date() : body.status ? null : undefined,
      },
    });

    const updated = await getScopedSession(id, payload.userId);
    return successResponse(serializeSwarmSession(updated));
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Update swarm session error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const existing = await getScopedSession(id, payload.userId);

    if (!existing) {
      return notFoundResponse('Swarm session not found');
    }

    await prisma.swarmSession.delete({
      where: { id },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Delete swarm session error:', error);
    return errorResponse('Internal server error', 500);
  }
}
