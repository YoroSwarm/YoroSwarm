/**
 * Agents Hook
 * 迁移自 React SPA: frontend/src/hooks/useAgents.ts
 * 用于管理 Agent 数据和操作
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { agentsApi } from '@/lib/api/agents';
import type { Agent, AgentActivity, AgentMessage } from '@/types/agent';
import { storage } from '@/utils/storage';

const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

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
    load: 0,
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
  swarmSessionId?: string;
}

export function useAgents(options: UseAgentsOptions = {}) {
  const { autoLoad = true, swarmSessionId } = options;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveSwarmSessionId = useCallback(() => {
    const storedSessionId = storage.get<string>(CURRENT_SESSION_STORAGE_KEY);
    return swarmSessionId || storedSessionId || undefined;
  }, [swarmSessionId]);

  const loadAgents = useCallback(async () => {
    const scopedSessionId = resolveSwarmSessionId();

    if (!scopedSessionId) {
      setAgents([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await agentsApi.getAgents({ swarmSessionId: scopedSessionId });
      setAgents(response.agents.map(convertApiAgent));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Agent 失败');
    } finally {
      setIsLoading(false);
    }
  }, [resolveSwarmSessionId]);

  const createAgent = useCallback(async (agentData: Omit<Agent, 'id' | 'createdAt' | 'lastActiveAt' | 'messageCount' | 'completedTasks'>) => {
    const scopedSessionId = resolveSwarmSessionId();
    if (!scopedSessionId) {
      const nextError = 'No active swarm session';
      setError(nextError);
      throw new Error(nextError);
    }

    setIsLoading(true);
    try {
      const response = await agentsApi.createAgent({
        name: agentData.name,
        agent_type: agentData.type,
        description: agentData.description,
        expertise: agentData.expertise,
        swarmSessionId: scopedSessionId,
      });
      await loadAgents();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 Agent 失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadAgents, resolveSwarmSessionId]);

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

  const deleteAgent = useCallback(async (id: string) => {
    try {
      await agentsApi.deleteAgent(id);
      setAgents((prev) => prev.filter((agent) => agent.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除 Agent 失败');
      throw err;
    }
  }, []);

  const addActivity = useCallback((activity: Omit<AgentActivity, 'id' | 'timestamp'>) => {
    const newActivity: AgentActivity = {
      ...activity,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setActivities((prev) => [newActivity, ...prev].slice(0, 100));
  }, []);

  const addMessage = useCallback((message: Omit<AgentMessage, 'id' | 'timestamp'>) => {
    const newMessage: AgentMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage].slice(-100));
  }, []);

  const getAgentMessages = useCallback((agentId: string) => {
    return messages.filter((msg) => msg.agentId === agentId);
  }, [messages]);

  const getAgentActivities = useCallback((agentId: string) => {
    return activities.filter((act) => act.agentId === agentId);
  }, [activities]);

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
