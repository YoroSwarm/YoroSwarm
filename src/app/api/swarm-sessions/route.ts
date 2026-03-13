import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { createSwarmSession } from '@/lib/server/swarm-session';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';

export async function GET() {
  try {
    const payload = await requireTokenPayload();
    const sessions = await prisma.swarmSession.findMany({
      where: { userId: payload.userId },
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
      orderBy: { updatedAt: 'desc' },
    });

    return successResponse({
      items: sessions.map((session) => serializeSwarmSession(session)),
      total: sessions.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('List swarm sessions error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : null;

    const created = await createSwarmSession({
      userId: payload.userId,
      title,
      goal: typeof body.goal === 'string' ? body.goal.trim() : typeof body.description === 'string' ? body.description.trim() : null,
      mode: typeof body.mode === 'string' ? body.mode : 'general_office',
    });

    const session = await prisma.swarmSession.findUnique({
      where: { id: created.id },
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

    return successResponse(serializeSwarmSession(session), 'Swarm session created successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Create swarm session error:', error);
    return errorResponse('Internal server error', 500);
  }
}
