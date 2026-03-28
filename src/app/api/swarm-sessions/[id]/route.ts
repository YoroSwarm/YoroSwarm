import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';
import {
  cleanupCognitiveLead,
} from '@/lib/server/cognitive-lead-runner';
import {
  cleanupCognitiveTeammate,
} from '@/lib/server/cognitive-teammate-runner';
import { destroyRuntime } from '@/lib/server/cognitive-inbox';
import { clearSessionReadFileCache } from '@/lib/server/teammate-tool-executor';

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
        archivedAt: body.status === 'archived' ? new Date() : body.status && body.status !== 'archived' ? null : undefined,
        pinnedAt: body.isPinned === true ? new Date() : body.isPinned === false ? null : undefined,
        lastActiveAt: body.lastActiveAt ? new Date(body.lastActiveAt) : undefined,
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

    // 1. 清理文件读取缓存（避免内存泄漏）
    try {
      clearSessionReadFileCache(id);
      console.log(`[DeleteSession] Cleared file read cache for session ${id}`);
    } catch (err) {
      console.error(`[DeleteSession] Error clearing file read cache:`, err);
    }

    // 2. 清理正在运行的 Lead 处理器
    if (leadAgentId) {
      try {
        cleanupCognitiveLead(id, leadAgentId);
        console.log(`[DeleteSession] Cleaned up lead processor for session ${id}`);
      } catch (err) {
        console.error(`[DeleteSession] Error cleaning up lead processor:`, err);
      }
    }

    // 3. 清理所有 Teammate 处理器（即使 getTeammateProcessor 返回 undefined 也要调用 cleanup）
    for (const agent of existing.agents) {
      if (agent.id === leadAgentId) continue;
      try {
        cleanupCognitiveTeammate(id, agent.id);
        console.log(`[DeleteSession] Cleaned up teammate processor for agent ${agent.id}`);
      } catch (err) {
        console.error(`[DeleteSession] Error cleaning up teammate ${agent.id}:`, err);
      }
    }

    // 4. 销毁所有运行时（清理内存状态）
    for (const agent of existing.agents) {
      try {
        destroyRuntime(id, agent.id);
      } catch (err) {
        console.error(`[DeleteSession] Error destroying runtime for agent ${agent.id}:`, err);
      }
    }

    // 4. 不再删除工作区目录（现在工作区在 workspace 级别共享，多个会话共用）
    // 会话删除只清理会话特定的 Agent/任务/对话，不影响工作区文件

    // 5. 从数据库删除会话（包括级联删除关联数据）
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
