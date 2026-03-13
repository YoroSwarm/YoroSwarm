'use client';

import { useCallback, useEffect, useState } from 'react';
import { swarmSessionsApi, type SwarmSessionMonitorResponse } from '@/lib/api/swarm-sessions';
import { storage } from '@/utils/storage';

const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

interface UseTeamStatsOptions {
  swarmSessionId?: string;
  autoLoad?: boolean;
}

export function useTeamStats(options: UseTeamStatsOptions = {}) {
  const { swarmSessionId, autoLoad = true } = options;
  const [stats, setStats] = useState<SwarmSessionMonitorResponse['metrics'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedSessionId = swarmSessionId || storage.get<string>(CURRENT_SESSION_STORAGE_KEY) || undefined;

  const loadStats = useCallback(async () => {
    if (!resolvedSessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await swarmSessionsApi.getMonitor(resolvedSessionId);
      setStats(response.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话状态失败');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId]);

  useEffect(() => {
    if (autoLoad && resolvedSessionId) {
      void loadStats();
    }
  }, [autoLoad, resolvedSessionId, loadStats]);

  return {
    stats,
    isLoading,
    error,
    loadStats,
    totalAgents: stats?.total_agents || 0,
    activeAgents: stats?.active_agents || 0,
    busyAgents: stats?.busy_agents || 0,
    totalTasks: stats?.total_tasks || 0,
    pendingTasks: stats?.pending_tasks || 0,
    inProgressTasks: stats?.in_progress_tasks || 0,
    completedTasks: stats?.completed_tasks || 0,
    failedTasks: stats?.failed_tasks || 0,
    averageLoad: 0,
  };
}
