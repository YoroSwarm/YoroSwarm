import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';
import { deleteSessionWorkspace } from '@/lib/server/session-workspace';
import {
  cleanupCognitiveLead,
  getCognitiveLeadProcessor,
} from '@/lib/server/cognitive-lead-runner';
import {
  getTeammateProcessor,
  cleanupCognitiveTeammate,
} from '@/lib/server/cognitive-teammate-runner';
import { destroyRuntime } from '@/lib/server/cognitive-inbox';

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

    const leadAgentId = existing.leadAgentId;

    // 1. 清理正在运行的 Lead 处理器（如果存在）
    if (leadAgentId) {
      const leadProcessor = getCognitiveLeadProcessor(id, leadAgentId);
      if (leadProcessor) {
        cleanupCognitiveLead(id, leadAgentId);
        console.log(`[DeleteSession] Cleaned up lead processor for session ${id}`);
      }
    }

    // 2. 清理所有 Teammate 处理器
    for (const agent of existing.agents) {
      if (agent.id === leadAgentId) continue;
      const processor = getTeammateProcessor(id, agent.id);
      if (processor) {
        cleanupCognitiveTeammate(id, agent.id);
        console.log(`[DeleteSession] Cleaned up teammate processor for agent ${agent.id}`);
      }
    }

    // 3. 销毁所有运行时
    for (const agent of existing.agents) {
      destroyRuntime(id, agent.id);
    }

    // 4. 删除会话工作区文件
    await deleteSessionWorkspace(id);

    // 5. 从数据库删除会话
    await prisma.swarmSession.delete({
      where: { id },
    });

    console.log(`[DeleteSession] Session ${id} deleted successfully`);
    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Delete swarm session error:', error);
    return errorResponse('Internal server error', 500);
  }
}
