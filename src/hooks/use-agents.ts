/**
 * Agents Hook
 * 迁移自 React SPA: frontend/src/hooks/useAgents.ts
 * 用于管理 Agent 数据和操作
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { agentsApi } from '@/lib/api/agents';
import { teamsApi, type TeamAgentResponse } from '@/lib/api/teams';
import type { Agent, AgentActivity, AgentMessage } from '@/types/agent';
import { storage } from '@/utils/storage';

const CURRENT_TEAM_STORAGE_KEY = 'current_team_id';

// 转换 API Agent 到前端 Agent 类型
const convertApiAgent = (apiAgent: {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
  expertise?: string[];
  created_at?: string;
  last_active_at?: string;
  message_count?: number;
  completed_tasks?: number;
  current_task_id?: string | null;
}): Agent => {
  const statusMap: Record<string, Agent['status']> = {
    online: 'online',
    idle: 'idle',
    busy: 'busy',
    offline: 'offline',
    error: 'error',
  };

  return {
    id: apiAgent.id,
    name: apiAgent.name,
    type: apiAgent.type as Agent['type'],
    status: statusMap[apiAgent.status] || 'idle',
    currentTask: apiAgent.current_task_id || undefined,
    load: 0, // 需要从其他 API 获取
    description: apiAgent.description || '',
    expertise: apiAgent.expertise || [],
    createdAt: apiAgent.created_at || new Date().toISOString(),
    lastActiveAt: apiAgent.last_active_at || new Date().toISOString(),
    messageCount: apiAgent.message_count || 0,
    completedTasks: apiAgent.completed_tasks || 0,
  };
};

interface UseAgentsOptions {
  autoLoad?: boolean;
  teamId?: string;
}

export function useAgents(options: UseAgentsOptions = {}) {
  const { autoLoad = true, teamId } = options;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveTeamId = useCallback(() => {
    const storedTeamId = storage.get<string>(CURRENT_TEAM_STORAGE_KEY);
    if (teamId || storedTeamId) {
      return teamId || storedTeamId || undefined;
    }

    const teams = storage.get<Array<{ id: string }>>('monitor_teams');
    const currentTeam = storage.get<{ id?: string }>('monitor_current_team');

    return currentTeam?.id || teams?.[0]?.id || undefined;
  }, [teamId]);

  const convertTeamAgent = useCallback((apiAgent: TeamAgentResponse): Agent => {
    return {
      id: apiAgent.id,
      name: apiAgent.name,
      type: (apiAgent.role === 'team_lead'
        ? 'leader'
        : apiAgent.role.includes('analysis') || apiAgent.role.includes('research') || apiAgent.role.includes('document')
          ? 'specialist'
          : apiAgent.role.includes('coordinator')
            ? 'coordinator'
            : 'worker') as Agent['type'],
      status: apiAgent.status === 'offline'
        ? 'offline'
        : apiAgent.status === 'busy'
          ? 'busy'
          : apiAgent.status === 'error'
            ? 'error'
            : 'idle',
      currentTask: undefined,
      load: Math.min(Math.round((apiAgent.current_load / Math.max(apiAgent.max_load, 1)) * 100), 100),
      description: apiAgent.description || apiAgent.role,
      expertise: apiAgent.capabilities || [],
      createdAt: apiAgent.created_at,
      lastActiveAt: apiAgent.last_active_at || apiAgent.updated_at,
      messageCount: 0,
      completedTasks: 0,
    };
  }, []);

  // 加载 Agent 列表
  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const scopedTeamId = resolveTeamId();
      const convertedAgents = scopedTeamId
        ? (await teamsApi.getTeamMembers(scopedTeamId)).items.map(convertTeamAgent)
        : (await agentsApi.getAgents()).agents.map(convertApiAgent);
      setAgents(convertedAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Agent 失败');
    } finally {
      setIsLoading(false);
    }
  }, [convertTeamAgent, resolveTeamId]);

  // 创建 Agent
  const createAgent = useCallback(async (agentData: Omit<Agent, 'id' | 'createdAt' | 'lastActiveAt' | 'messageCount' | 'completedTasks'>) => {
    setIsLoading(true);
    try {
      const scopedTeamId = resolveTeamId();
      const response = scopedTeamId
        ? await teamsApi.createAgent(scopedTeamId, {
            name: agentData.name,
            role: agentData.type === 'leader'
              ? 'team_lead'
              : agentData.type === 'specialist'
                ? 'specialist'
                : agentData.type,
            description: agentData.description,
            capabilities: agentData.expertise,
          })
        : await agentsApi.createAgent({
            name: agentData.name,
            agent_type: agentData.type,
            description: agentData.description,
            expertise: agentData.expertise,
          });
      // 重新加载列表
      await loadAgents();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 Agent 失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadAgents, resolveTeamId]);

  // 更新 Agent
  const updateAgent = useCallback(async (id: string, updates: Partial<Agent>) => {
    try {
      await agentsApi.updateAgent(id, {
        name: updates.name,
        description: updates.description,
        expertise: updates.expertise,
      });
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 Agent 失败');
      throw err;
    }
  }, [loadAgents]);

  // 删除 Agent
  const deleteAgent = useCallback(async (id: string) => {
    try {
      await agentsApi.deleteAgent(id);
      setAgents((prev) => prev.filter((agent) => agent.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除 Agent 失败');
      throw err;
    }
  }, []);

  // 添加活动
  const addActivity = useCallback((activity: Omit<AgentActivity, 'id' | 'timestamp'>) => {
    const newActivity: AgentActivity = {
      ...activity,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setActivities((prev) => [newActivity, ...prev].slice(0, 100));
  }, []);

  // 添加消息
  const addMessage = useCallback((message: Omit<AgentMessage, 'id' | 'timestamp'>) => {
    const newMessage: AgentMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage].slice(-100));
  }, []);

  // 获取 Agent 消息
  const getAgentMessages = useCallback((agentId: string) => {
    return messages.filter((msg) => msg.agentId === agentId);
  }, [messages]);

  // 获取 Agent 活动
  const getAgentActivities = useCallback((agentId: string) => {
    return activities.filter((act) => act.agentId === agentId);
  }, [activities]);

  // 初始加载
  useEffect(() => {
    if (autoLoad) {
      loadAgents();
    }
  }, [autoLoad, loadAgents]);

  return {
    agents,
    activities,
    messages,
    selectedAgent,
    isLoading,
    error,
    setSelectedAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    addActivity,
    addMessage,
    getAgentMessages,
    getAgentActivities,
    loadAgents,
  };
}
