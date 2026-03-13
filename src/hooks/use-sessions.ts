'use client';

import { useCallback, useEffect, useState } from 'react';
import { swarmSessionsApi, type SwarmSessionResponse } from '@/lib/api/swarm-sessions';
import type { Session } from '@/types/chat';
import { storage } from '@/utils/storage';

export const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

interface UseSessionsOptions {
  autoLoad?: boolean;
}

interface CreateSessionInput {
  title?: string;
  goal?: string;
  description?: string;
}

function convertSession(session: SwarmSessionResponse): Session {
  const lead = session.agents.find((agent) => agent.id === session.lead_agent_id);

  return {
    id: session.id,
    title: session.title,
    description: session.goal,
    participants: session.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.id === session.lead_agent_id ? 'lead' : 'teammate',
      status: agent.status === 'offline' ? 'offline' : agent.status === 'busy' ? 'busy' : 'online',
    })),
    lastMessage: session.last_message
      ? {
          id: session.last_message.id,
          sessionId: session.id,
          type: session.last_message.message_type === 'file' ? 'file' : session.last_message.message_type === 'system' ? 'system' : 'text',
          content: session.last_message.content,
          sender: {
            id: session.last_message.sender_id || lead?.id || 'lead',
            type: session.last_message.sender_type === 'user' ? 'user' : 'agent',
            name: session.last_message.sender_type === 'user' ? '我' : lead?.name || 'Lead',
          },
          status: 'received',
          createdAt: session.last_message.created_at,
        }
      : undefined,
    unreadCount: 0,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    status: session.status === 'archived' ? 'archived' : 'active',
  };
}

export function useSessions(options: UseSessionsOptions = {}) {
  const { autoLoad = true } = options;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await swarmSessionsApi.listSessions();
      const converted = response.items.map(convertSession);
      setSessions(converted);
      setTotalCount(response.total);

      if (!storage.get<string>(CURRENT_SESSION_STORAGE_KEY) && converted[0]?.id) {
        storage.set(CURRENT_SESSION_STORAGE_KEY, converted[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSession = useCallback(async (input?: string | CreateSessionInput) => {
    const payload = typeof input === 'string'
      ? { title: input }
      : input || {};

    const created = await swarmSessionsApi.createSession({
      title: payload.title,
      goal: payload.goal,
      description: payload.description,
      mode: 'general_office',
    });
    const converted = convertSession(created);
    setSessions((prev) => [converted, ...prev.filter((session) => session.id !== converted.id)]);
    storage.set(CURRENT_SESSION_STORAGE_KEY, converted.id);
    return converted;
  }, []);

  const ensureLeadSession = useCallback(async ({ leadAgentId, leadAgentName }: { leadAgentId: string; leadAgentName?: string }) => {
    const existing = sessions.find((session) => session.participants.some((participant) => participant.id === leadAgentId));
    if (existing) return existing;
    return createSession(leadAgentName ? `${leadAgentName} 会话` : 'Lead 会话');
  }, [createSession, sessions]);

  const openDirectSessionForAgent = useCallback(async (_agentId: string, _agentName?: string) => {
    throw new Error('用户不再直接与 teammate 建立外部会话，请进入对应 SwarmSession 与 Lead 对话。');
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    await swarmSessionsApi.deleteSession(sessionId);
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    if (storage.get<string>(CURRENT_SESSION_STORAGE_KEY) === sessionId) {
      storage.remove(CURRENT_SESSION_STORAGE_KEY);
    }
  }, []);

  const archiveSession = useCallback(async (sessionId: string) => {
    const updated = await swarmSessionsApi.updateSession(sessionId, { status: 'archived' });
    const converted = convertSession(updated);
    setSessions((prev) => prev.map((session) => session.id === sessionId ? converted : session));
  }, []);

  useEffect(() => {
    if (autoLoad) {
      void loadSessions();
    }
  }, [autoLoad, loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    totalCount,
    loadSessions,
    createSession,
    ensureLeadSession,
    openDirectSessionForAgent,
    deleteSession,
    archiveSession,
  };
}
