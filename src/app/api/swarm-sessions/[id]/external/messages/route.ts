import { NextRequest } from 'next/server';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import prisma from '@/lib/db';
import { appendExternalUserMessage, listExternalMessages } from '@/lib/server/external-chat';
import { serializeExternalMessage } from '@/lib/server/swarm-session-view';
import { publishRealtimeMessage } from '@/app/api/ws/route';
import { getLeadAgentForSession } from '@/lib/server/swarm-session';
import { runCognitiveLeadLoop } from '@/lib/server/cognitive-lead-runner';

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

    // 1. 保存用户消息
    const { message } = await appendExternalUserMessage({
      swarmSessionId: id,
      userId: payload.userId,
      content,
      messageType: typeof body.message_type === 'string' ? body.message_type : 'text',
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
    });

    const serialized = serializeExternalMessage(message);

    // 2. 广播用户消息到 WebSocket
    publishRealtimeMessage({
      type: 'chat_message',
      payload: {
        ...serialized,
        timestamp: serialized.created_at,
      },
    }, {
      sessionId: id,
    });

    // 3. 获取 Lead Agent
    const lead = await getLeadAgentForSession(id);
    if (!lead) {
      return errorResponse('Lead agent not found', 500);
    }

    // 4. 验证 Lead Agent 在数据库中确实存在
    const leadAgentCheck = await prisma.agent.findUnique({ where: { id: lead.id } });
    if (!leadAgentCheck) {
      console.error(`[ExternalMessages] Lead agent ${lead.id} not found in database`);
      return errorResponse('Lead agent not found in database', 500);
    }
    console.log(`[ExternalMessages] Verified lead agent exists: ${leadAgentCheck.name} (${lead.id})`);

    // 5. 触发认知 Lead Agent Loop（投递到收件箱，异步，不阻塞响应）
    const attachments = body.attachments || [];

    runCognitiveLeadLoop({
      swarmSessionId: id,
      userId: payload.userId,
      leadAgentId: lead.id,
      userMessage: content,
      sourceRef: `external:${message.id}`,
      attachments: attachments.map((a: { fileId?: string; fileName?: string; mimeType?: string }) => ({
        fileId: a.fileId || '',
        fileName: a.fileName || '',
        mimeType: a.mimeType || '',
      })),
    }).catch(err => {
      console.error('Lead agent loop error:', err);
      // Broadcast error to user via WebSocket
      publishRealtimeMessage({
        type: 'chat_message',
        payload: {
          id: `error-${Date.now()}`,
          swarm_session_id: id,
          sender_type: 'system',
          sender_name: 'System',
          content: `处理消息时出错: ${err instanceof Error ? err.message : 'Unknown error'}`,
          message_type: 'system',
          created_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        },
      }, { sessionId: id });
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
