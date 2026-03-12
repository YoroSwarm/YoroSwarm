'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { teamsApi } from '@/lib/api/teams';
import type { Agent, Team } from '@/types/agent';
import { storage } from '@/utils/storage';

const CURRENT_TEAM_STORAGE_KEY = 'current_team_id';

type ApiTeam = {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  config?: string;
  agents?: Array<{
    id: string;
    name: string;
    role: string;
    description?: string | null;
    status: 'IDLE' | 'BUSY' | 'OFFLINE' | 'ERROR';
    createdAt: string;
    updatedAt: string;
    capabilities?: string | null;
    tasks?: Array<{ id: string; title: string; status: string }>;
  }>;
  tasks?: Array<{ id: string; status: string }>;
};

type ApiTeamAgent = NonNullable<ApiTeam['agents']>[number];

type CreateSwarmSessionInput = {
  name: string;
  description?: string;
  sessionGoal?: string;
};

function parseCapabilities(value?: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapStatus(status: ApiTeamAgent['status']): Agent['status'] {
  switch (status) {
    case 'BUSY':
      return 'busy';
    case 'OFFLINE':
      return 'offline';
    case 'ERROR':
      return 'error';
    default:
      return 'idle';
  }
}

function mapRoleToType(role: string): Agent['type'] {
  if (role === 'team_lead') return 'leader';
  if (role.includes('analysis') || role.includes('research') || role.includes('document')) return 'specialist';
  if (role.includes('coordinator')) return 'coordinator';
  return 'worker';
}

function convertAgent(agent: ApiTeamAgent): Agent {
  const assignedCount = agent.tasks?.filter((task) => task.status !== 'COMPLETED' && task.status !== 'FAILED' && task.status !== 'CANCELLED').length || 0;

  return {
    id: agent.id,
    name: agent.name,
    type: mapRoleToType(agent.role),
    status: mapStatus(agent.status),
    currentTask: agent.tasks?.find((task) => task.status === 'IN_PROGRESS')?.title,
    load: Math.min(assignedCount * 30, 100),
    description: agent.description || agent.role,
    expertise: parseCapabilities(agent.capabilities),
    createdAt: agent.createdAt,
    lastActiveAt: agent.updatedAt,
    messageCount: 0,
    completedTasks: agent.tasks?.filter((task) => task.status === 'COMPLETED').length || 0,
  };
}

function convertTeam(team: ApiTeam): Team {
  const agents = team.agents || [];
  const tasks = team.tasks || [];

  return {
    id: team.id,
    name: team.name,
    description: team.description || 'Swarm 单用户协作会话',
    agentCount: agents.length,
    activeAgents: agents.filter((agent) => agent.status !== 'OFFLINE').length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.status === 'COMPLETED').length,
  };
}

export function useSwarmTeam() {
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [currentTeamId, setCurrentTeamIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCurrentTeamId = useCallback((teamId: string | null) => {
    setCurrentTeamIdState(teamId);
    if (teamId) {
      storage.set(CURRENT_TEAM_STORAGE_KEY, teamId);
    } else {
      storage.remove(CURRENT_TEAM_STORAGE_KEY);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await teamsApi.listTeams();
      const nextTeams = Array.isArray(response) ? response : response.items;
      const storedTeamId = storage.get<string>(CURRENT_TEAM_STORAGE_KEY);
      setTeams(nextTeams);

      setCurrentTeamIdState((prev) => {
        if (prev && nextTeams.some((team) => team.id === prev)) return prev;
        if (storedTeamId && nextTeams.some((team) => team.id === storedTeamId)) return storedTeamId;
        const fallbackTeamId = nextTeams[0]?.id ?? null;
        if (fallbackTeamId) {
          storage.set(CURRENT_TEAM_STORAGE_KEY, fallbackTeamId);
        }
        return fallbackTeamId;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Swarm 会话失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSwarmSession = useCallback(async (input: CreateSwarmSessionInput) => {
    setIsLoading(true);
    setError(null);

    try {
      const created = await teamsApi.createTeam({
        name: input.name,
        description: input.description,
        config: {
          autoProvision: true,
          sessionGoal: input.sessionGoal,
          workspaceMode: 'general_office',
        },
      });

      const createdTeam = created as ApiTeam;
      setTeams((prev) => [createdTeam, ...prev]);
      setCurrentTeamId(createdTeam.id);
      return createdTeam;
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

  const currentTeamCard = useMemo(
    () => (currentTeam ? convertTeam(currentTeam) : null),
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
    currentTeamCard,
    agents,
    isLoading,
    error,
    setCurrentTeamId,
    loadTeams,
    createSwarmSession,
  };
}
