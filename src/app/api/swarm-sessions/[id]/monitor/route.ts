import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { serializeSwarmSession } from '@/lib/server/swarm-session-view';
import { summarizeUsageTotals } from '@/lib/server/llm/usage';
import { getProviderConfig } from '@/lib/server/llm/config';

type RouteContext = {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;

    const [session, contextCount, internalThreads, internalMessages, usageEvents, leadSelfTodos] = await Promise.all([
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
      prisma.llmUsageEvent.findMany({
        where: { swarmSessionId: id },
        select: {
          agentId: true,
          inputTokens: true,
          outputTokens: true,
          cacheCreationTokens: true,
          cacheReadTokens: true,
          createdAt: true,
        },
      }),
      prisma.leadSelfTodo.findMany({
        where: { swarmSessionId: id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          details: true,
          status: true,
          category: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!session) {
      return notFoundResponse('Swarm session not found');
    }

    const usageByAgentId = new Map<string, ReturnType<typeof summarizeUsageTotals>>();
    const lastCallByAgentId = new Map<string, number>();
    for (const agent of session.agents) {
      const rows = usageEvents.filter((event) => event.agentId === agent.id);
      usageByAgentId.set(agent.id, summarizeUsageTotals(rows));
      // Find last call's input tokens (current context fill level)
      // Total context = inputTokens + cacheCreationTokens + cacheReadTokens
      // (all three are part of the prompt sent to the model)
      if (rows.length > 0) {
        const latest = rows.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
        lastCallByAgentId.set(agent.id, latest.inputTokens + (latest.cacheCreationTokens ?? 0) + (latest.cacheReadTokens ?? 0));
      }
    }

    const llmConfig = getProviderConfig();

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
      model_context_size: llmConfig.maxContextTokens,
      llm_usage: {
        session: summarizeUsageTotals(usageEvents),
        lead_agent_id: session.leadAgentId || undefined,
        lead: session.leadAgentId ? usageByAgentId.get(session.leadAgentId) || summarizeUsageTotals([]) : summarizeUsageTotals([]),
        lead_last_call_context_tokens: session.leadAgentId ? lastCallByAgentId.get(session.leadAgentId) || 0 : 0,
        teammates: session.agents
          .filter((agent) => agent.id !== session.leadAgentId)
          .map((agent) => ({
            agent_id: agent.id,
            agent_name: agent.name,
            role: agent.role,
            usage: usageByAgentId.get(agent.id) || summarizeUsageTotals([]),
            last_call_context_tokens: lastCallByAgentId.get(agent.id) || 0,
          })),
      },
      lead_self_todos: leadSelfTodos.map((item) => ({
        id: item.id,
        title: item.title,
        details: item.details || undefined,
        status: item.status,
        category: item.category,
        updated_at: item.updatedAt.toISOString(),
      })),
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
