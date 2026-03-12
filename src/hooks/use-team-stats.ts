/**
 * Team Stats Hook
 * 迁移自 React SPA: frontend/src/hooks/useTeamStats.ts
 * 用于管理团队统计数据
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { teamsApi, type TeamStatusResponse } from '@/lib/api/teams';
import { storage } from '@/utils/storage';

const CURRENT_TEAM_STORAGE_KEY = 'current_team_id';

interface UseTeamStatsOptions {
  teamId?: string;
  autoLoad?: boolean;
}

export function useTeamStats(options: UseTeamStatsOptions = {}) {
  const { teamId, autoLoad = true } = options;
  const [stats, setStats] = useState<TeamStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedTeamId = teamId || storage.get<string>(CURRENT_TEAM_STORAGE_KEY) || 'default';

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await teamsApi.getTeamStatus(resolvedTeamId);
      setStats(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载团队状态失败');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedTeamId]);

  useEffect(() => {
    if (autoLoad && resolvedTeamId) {
      loadStats();
    }
  }, [autoLoad, resolvedTeamId, loadStats]);

  return {
    stats,
    isLoading,
    error,
    loadStats,
    // 便利计算属性
    totalAgents: stats?.total_agents || 0,
    activeAgents: stats?.active_agents || 0,
    busyAgents: stats?.busy_agents || 0,
    totalTasks: stats?.total_tasks || 0,
    pendingTasks: stats?.pending_tasks || 0,
    inProgressTasks: stats?.in_progress_tasks || 0,
    completedTasks: stats?.completed_tasks || 0,
    failedTasks: stats?.failed_tasks || 0,
    averageLoad: stats?.average_load || 0,
  };
}
