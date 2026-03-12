/**
 * API Agents Hook
 * 迁移自 React SPA: frontend/src/hooks/useApiAgents.ts
 * 用于管理 Agent 的 CRUD 操作和生命周期
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { agentsApi } from '@/lib/api/agents';
import type {
  CreateAgentRequest,
  CreateAgentResponse,
  AgentActionResponse,
  AssignTaskRequest,
  AssignTaskResponse,
} from '@/lib/api/agents';
import type { Agent } from '@/types/agent';

interface UseApiAgentsState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  total: number;
}

interface UseApiAgentsReturn extends UseApiAgentsState {
  // 数据获取
  fetchAgents: () => Promise<void>;
  refreshAgents: () => Promise<void>;

  // CRUD 操作
  createAgent: (data: CreateAgentRequest) => Promise<CreateAgentResponse | null>;
  updateAgent: (agentId: string, data: Partial<CreateAgentRequest>) => Promise<Agent | null>;
  deleteAgent: (agentId: string) => Promise<boolean>;

  // Agent 生命周期管理
  pauseAgent: (agentId: string) => Promise<AgentActionResponse | null>;
  resumeAgent: (agentId: string) => Promise<AgentActionResponse | null>;
  terminateAgent: (agentId: string, force?: boolean) => Promise<AgentActionResponse | null>;
  recoverAgent: (agentId: string) => Promise<AgentActionResponse | null>;

  // 任务管理
  assignTask: (agentId: string, data: AssignTaskRequest) => Promise<AssignTaskResponse | null>;

  // 上下文管理
  clearAgentContext: (agentId: string) => Promise<AgentActionResponse | null>;

  // 状态管理
  setError: (error: string | null) => void;
  clearError: () => void;
}

export function useApiAgents(): UseApiAgentsReturn {
  const [state, setState] = useState<UseApiAgentsState>({
    agents: [],
    isLoading: false,
    error: null,
    total: 0,
  });

  // 获取 Agent 列表
  const fetchAgents = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await agentsApi.getAgents();
      setState({
        agents: response.agents,
        total: response.total,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取 Agent 列表失败';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
    }
  }, []);

  // 刷新 Agent 列表
  const refreshAgents = useCallback(async () => {
    await fetchAgents();
  }, [fetchAgents]);

  // 创建 Agent
  const createAgent = useCallback(async (data: CreateAgentRequest): Promise<CreateAgentResponse | null> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await agentsApi.createAgent(data);
      // 刷新列表
      await fetchAgents();
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建 Agent 失败';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      return null;
    }
  }, [fetchAgents]);

  // 更新 Agent
  const updateAgent = useCallback(async (
    agentId: string,
    data: Partial<CreateAgentRequest>
  ): Promise<Agent | null> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await agentsApi.updateAgent(agentId, data);
      // 更新本地状态
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((agent) =>
          agent.id === agentId ? { ...agent, ...response } : agent
        ),
        isLoading: false,
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新 Agent 失败';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      return null;
    }
  }, []);

  // 删除 Agent
  const deleteAgent = useCallback(async (agentId: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await agentsApi.deleteAgent(agentId);
      // 更新本地状态
      setState((prev) => ({
        ...prev,
        agents: prev.agents.filter((agent) => agent.id !== agentId),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除 Agent 失败';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      return false;
    }
  }, []);

  // 暂停 Agent
  const pauseAgent = useCallback(async (agentId: string): Promise<AgentActionResponse | null> => {
    try {
      const response = await agentsApi.pauseAgent(agentId);
      // 更新本地状态
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((agent) =>
          agent.id === agentId ? { ...agent, status: 'offline' as const } : agent
        ),
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '暂停 Agent 失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 恢复 Agent
  const resumeAgent = useCallback(async (agentId: string): Promise<AgentActionResponse | null> => {
    try {
      const response = await agentsApi.resumeAgent(agentId);
      // 更新本地状态
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((agent) =>
          agent.id === agentId ? { ...agent, status: 'idle' as const } : agent
        ),
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '恢复 Agent 失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 终止 Agent
  const terminateAgent = useCallback(async (
    agentId: string,
    force = false
  ): Promise<AgentActionResponse | null> => {
    try {
      const response = await agentsApi.terminateAgent(agentId, force);
      if (response.success) {
        // 从列表中移除
        setState((prev) => ({
          ...prev,
          agents: prev.agents.filter((agent) => agent.id !== agentId),
        }));
      }
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '终止 Agent 失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 恢复出错的 Agent
  const recoverAgent = useCallback(async (agentId: string): Promise<AgentActionResponse | null> => {
    try {
      const response = await agentsApi.recoverAgent(agentId);
      // 更新本地状态
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((agent) =>
          agent.id === agentId ? { ...agent, status: 'idle' as const } : agent
        ),
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '恢复 Agent 失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 分配任务
  const assignTask = useCallback(async (
    agentId: string,
    data: AssignTaskRequest
  ): Promise<AssignTaskResponse | null> => {
    try {
      const response = await agentsApi.assignTask(agentId, data);
      // 更新 Agent 状态为忙碌
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((agent) =>
          agent.id === agentId
            ? { ...agent, status: 'busy' as const, currentTask: response.task_id }
            : agent
        ),
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '分配任务失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 清除 Agent 上下文
  const clearAgentContext = useCallback(async (agentId: string): Promise<AgentActionResponse | null> => {
    try {
      const response = await agentsApi.clearAgentContext(agentId);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '清除 Agent 上下文失败';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // 设置错误
  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // 初始加载
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAgents();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchAgents]);

  return {
    ...state,
    fetchAgents,
    refreshAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    pauseAgent,
    resumeAgent,
    terminateAgent,
    recoverAgent,
    assignTask,
    clearAgentContext,
    setError,
    clearError,
  };
}
