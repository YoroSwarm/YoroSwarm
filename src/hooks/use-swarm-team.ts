'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { swarmSessionsApi, type SwarmSessionResponse } from '@/lib/api/swarm-sessions';
import type { Agent, SessionSummary } from '@/types/agent';
import { storage } from '@/utils/storage';

const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

type ApiSession = SwarmSessionResponse;

function convertAgent(agent: ApiSession['agents'][number]): Agent {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.kind === 'lead'
      ? 'leader'
      : agent.kind === 'coordinator'
        ? 'coordinator'
        : agent.kind === 'researcher' || agent.kind === 'writer' || agent.kind === 'analyst' || agent.kind === 'engineer' || agent.kind === 'specialist'
          ? 'specialist'
          : 'worker',
    status: agent.status === 'offline'
      ? 'offline'
      : agent.status === 'busy'
        ? 'busy'
        : agent.status === 'error'
          ? 'error'
          : 'idle',
    currentTask: undefined,
    load: 0,
    description: agent.description || agent.role,
    expertise: agent.capabilities || [],
    createdAt: agent.created_at,
    lastActiveAt: agent.updated_at,
    messageCount: 0,
    completedTasks: 0,
  };
}

function convertSessionToSummary(session: ApiSession): SessionSummary {
  return {
    id: session.id,
    name: session.title,
    description: session.goal || 'Swarm 工作会话',
    agentCount: session.agents.length,
    activeAgents: session.agents.filter((agent) => agent.status !== 'offline').length,
    totalTasks: session.tasks.length,
    completedTasks: session.tasks.filter((task) => task.status === 'completed').length,
  };
}

export function useSwarmTeam() {
  const [teams, setTeams] = useState<ApiSession[]>([]);
  const [currentTeamId, setCurrentTeamIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCurrentTeamId = useCallback((sessionId: string | null) => {
    setCurrentTeamIdState(sessionId);
    if (sessionId) {
      storage.set(CURRENT_SESSION_STORAGE_KEY, sessionId);
    } else {
      storage.remove(CURRENT_SESSION_STORAGE_KEY);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await swarmSessionsApi.listSessions();
      const nextSessions = response.items;
      const storedSessionId = storage.get<string>(CURRENT_SESSION_STORAGE_KEY);
      setTeams(nextSessions);

      setCurrentTeamIdState((prev) => {
        if (prev && nextSessions.some((session) => session.id === prev)) return prev;
        if (storedSessionId && nextSessions.some((session) => session.id === storedSessionId)) return storedSessionId;
        const fallbackSessionId = nextSessions[0]?.id ?? null;
        if (fallbackSessionId) {
          storage.set(CURRENT_SESSION_STORAGE_KEY, fallbackSessionId);
        }
        return fallbackSessionId;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Swarm 会话失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSwarmSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const created = await swarmSessionsApi.createSession({
        mode: 'general_office',
      });

      setTeams((prev) => [created, ...prev]);
      setCurrentTeamId(created.id);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建 Swarm 会话失败';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setCurrentTeamId]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const currentTeam = useMemo(
    () => teams.find((team) => team.id === currentTeamId) || null,
    [teams, currentTeamId]
  );

  const currentSessionCard = useMemo(
    () => (currentTeam ? convertSessionToSummary(currentTeam) : null),
    [currentTeam]
  );

  const agents = useMemo(
    () => (currentTeam?.agents || []).map(convertAgent),
    [currentTeam]
  );

  return {
    teams,
    currentTeam,
    currentTeamId,
    currentSessionCard,
    agents,
    isLoading,
    error,
    setCurrentTeamId,
    loadTeams,
    createSwarmSession,
  };
}
