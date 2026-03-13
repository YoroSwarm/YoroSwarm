import { NextRequest } from 'next/server';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import prisma from '@/lib/db';
import { appendExternalUserMessage, listExternalMessages } from '@/lib/server/external-chat';
import { serializeExternalMessage } from '@/lib/server/swarm-session-view';
import { publishRealtimeMessage } from '@/app/api/ws/route';

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

    const { messages } = await listExternalMessages(id, payload.userId);
    return successResponse({
      items: messages.map(serializeExternalMessage),
      total: messages.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('List external messages error:', error);
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
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return errorResponse('Message content is required', 400);
    }

    const { message } = await appendExternalUserMessage({
      swarmSessionId: id,
      userId: payload.userId,
      content,
      messageType: typeof body.message_type === 'string' ? body.message_type : 'text',
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
    });

    const serialized = serializeExternalMessage(message);
    publishRealtimeMessage({
      type: 'chat_message',
      payload: {
        ...serialized,
        timestamp: serialized.created_at,
      },
    }, {
      sessionId: id,
    });

    return successResponse(serialized, 'Message sent successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Create external message error:', error);
    return errorResponse('Internal server error', 500);
  }
}
