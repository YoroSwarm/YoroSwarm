import { api } from './client';
import type {
  Agent,
  AgentStatus,
  AgentType,
} from '@/types/agent';

// Agent创建请求
export interface CreateAgentRequest {
  name: string;
  agent_type: AgentType;
  description?: string;
  expertise?: string[];
  max_concurrent_tasks?: number;
  context_window_size?: number;
  timeout_seconds?: number;
}

// Agent创建响应
export interface CreateAgentResponse {
  agent_id: string;
  name: string;
  status: string;
  message: string;
}

// Agent列表响应
export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

// Agent操作响应
export interface AgentActionResponse {
  agent_id: string;
  action: string;
  success: boolean;
  message: string;
}

// Agent上下文响应
export interface AgentContextResponse {
  agent_id: string;
  context_stats: {
    message_count: number;
    context_size: number;
    max_context_size: number;
  };
  messages: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
}

// Agent任务列表响应
export interface AgentTaskListResponse {
  agent_id: string;
  current_task_id: string | null;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
  }>;
}

// 任务分配请求
export interface AssignTaskRequest {
  task_type: string;
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
  input_data?: Record<string, unknown>;
}

// 任务分配响应
export interface AssignTaskResponse {
  task_id: string;
  agent_id: string;
  status: string;
  message: string;
}

/**
 * Agent API封装
 */
export const agentsApi = {
  /**
   * 创建新Agent
   */
  createAgent: async (data: CreateAgentRequest): Promise<CreateAgentResponse> => {
    return api.post<CreateAgentResponse>('/agents', data);
  },

  /**
   * 获取所有Agent列表
   */
  getAgents: async (): Promise<AgentListResponse> => {
    return api.get<AgentListResponse>('/agents');
  },

  /**
   * 获取单个Agent详情
   */
  getAgent: async (agentId: string): Promise<Agent> => {
    return api.get<Agent>(`/agents/${agentId}`);
  },

  /**
   * 获取Agent状态
   */
  getAgentStatus: async (agentId: string): Promise<{
    agent_id: string;
    name: string;
    agent_type: AgentType;
    status: AgentStatus;
    current_task_id?: string;
    total_tasks_completed: number;
    total_tasks_failed: number;
    last_active_at?: string;
    last_error?: string;
  }> => {
    return api.get(`/agents/${agentId}/status`);
  },

  /**
   * 更新Agent
   */
  updateAgent: async (agentId: string, data: Partial<CreateAgentRequest>): Promise<Agent> => {
    return api.put<Agent>(`/agents/${agentId}`, data);
  },

  /**
   * 删除Agent
   */
  deleteAgent: async (agentId: string): Promise<void> => {
    return api.delete(`/agents/${agentId}`);
  },

  /**
   * 暂停Agent
   */
  pauseAgent: async (agentId: string): Promise<AgentActionResponse> => {
    return api.post<AgentActionResponse>(`/agents/${agentId}/pause`);
  },

  /**
   * 恢复Agent
   */
  resumeAgent: async (agentId: string): Promise<AgentActionResponse> => {
    return api.post<AgentActionResponse>(`/agents/${agentId}/resume`);
  },

  /**
   * 终止Agent
   */
  terminateAgent: async (agentId: string, force = false): Promise<AgentActionResponse> => {
    return api.post<AgentActionResponse>(`/agents/${agentId}/terminate`, { force });
  },

  /**
   * 恢复出错的Agent
   */
  recoverAgent: async (agentId: string): Promise<AgentActionResponse> => {
    return api.post<AgentActionResponse>(`/agents/${agentId}/recover`);
  },

  /**
   * 分配任务给Agent
   */
  assignTask: async (agentId: string, data: AssignTaskRequest): Promise<AssignTaskResponse> => {
    return api.post<AssignTaskResponse>(`/agents/${agentId}/tasks`, data);
  },

  /**
   * 获取Agent的任务列表
   */
  getAgentTasks: async (agentId: string): Promise<AgentTaskListResponse> => {
    return api.get<AgentTaskListResponse>(`/agents/${agentId}/tasks`);
  },

  /**
   * 获取Agent上下文
   */
  getAgentContext: async (agentId: string, limit = 100): Promise<AgentContextResponse> => {
    return api.get<AgentContextResponse>(`/agents/${agentId}/context`, { params: { limit } });
  },

  /**
   * 清除Agent上下文
   */
  clearAgentContext: async (agentId: string): Promise<AgentActionResponse> => {
    return api.post<AgentActionResponse>(`/agents/${agentId}/context/clear`);
  },
};
