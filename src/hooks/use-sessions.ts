'use client';

import { useCallback, useEffect } from 'react';
import { useSessionsStore } from '@/stores';
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

export function useSessions(options: UseSessionsOptions = {}) {
  const { autoLoad = true } = options;

  const sessions = useSessionsStore((state) => state.sessions);
  const isLoading = useSessionsStore((state) => state.isLoading);
  const error = useSessionsStore((state) => state.error);
  const totalCount = useSessionsStore((state) => state.totalCount);
  const loadSessions = useSessionsStore((state) => state.loadSessions);
  const createSession = useSessionsStore((state) => state.createSession);
  const deleteSession = useSessionsStore((state) => state.deleteSession);
  const archiveSession = useSessionsStore((state) => state.archiveSession);
  const updateSessionParticipant = useSessionsStore((state) => state.updateSessionParticipant);

  const createSessionWithStorage = useCallback(async (input?: string | CreateSessionInput) => {
    const payload = typeof input === 'string'
      ? { title: input }
      : input || {};

    const created = await createSession(payload);
    storage.set(CURRENT_SESSION_STORAGE_KEY, created.id);
    return created;
  }, [createSession]);

  const ensureLeadSession = useCallback(async ({ leadAgentId, leadAgentName }: { leadAgentId: string; leadAgentName?: string }) => {
    const existing = sessions.find((session) => session.participants.some((participant) => participant.id === leadAgentId));
    if (existing) return existing;
    return createSessionWithStorage(leadAgentName ? `${leadAgentName} 会话` : 'Swarm 会话');
  }, [createSessionWithStorage, sessions]);

  const openDirectSessionForAgent = useCallback(async (_agentId: string, _agentName?: string) => {
    throw new Error('用户不再直接与 teammate 建立外部会话，请进入对应 SwarmSession 与 Lead 对话。');
  }, []);

  const deleteSessionWithStorage = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    if (storage.get<string>(CURRENT_SESSION_STORAGE_KEY) === sessionId) {
      storage.remove(CURRENT_SESSION_STORAGE_KEY);
    }
  }, [deleteSession]);

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
    createSession: createSessionWithStorage,
    ensureLeadSession,
    openDirectSessionForAgent,
    deleteSession: deleteSessionWithStorage,
    archiveSession,
    updateSessionParticipant,
  };
}
