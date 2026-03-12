import { api } from './client';

// Agent状态
export type TeamAgentStatus = 'idle' | 'busy' | 'offline' | 'error';

// 创建团队请求
export interface CreateTeamRequest {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

// 更新团队请求
export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

// 创建Agent请求
export interface CreateTeamAgentRequest {
  name: string;
  role: string;
  description?: string;
  capabilities?: string[];
  config?: Record<string, unknown>;
  max_load?: number;
}

// 更新Agent请求
export interface UpdateTeamAgentRequest {
  name?: string;
  role?: string;
  description?: string;
  capabilities?: string[];
  config?: Record<string, unknown>;
  max_load?: number;
}

// 更新Agent状态请求
export interface UpdateAgentStatusRequest {
  status: TeamAgentStatus;
}

// 创建任务请求
export interface CreateTeamTaskRequest {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
  task_type?: string;
  requirements?: string[];
  input_data?: Record<string, unknown>;
  workflow_id?: string;
  deadline?: string;
}

// 分配任务请求
export interface AssignTeamTaskRequest {
  agent_id?: string;
  strategy?: 'manual' | 'auto' | 'round_robin' | 'least_loaded' | 'capability_match';
}

// 创建工作流请求
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  workflow_type?: string;
  definition?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

// 更新工作流请求
export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  definition?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

// 工作流操作请求
export interface WorkflowActionRequest {
  action: 'start' | 'pause' | 'resume' | 'stop';
}

// 团队响应
export interface TeamResponse {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
  created_by?: string;
  createdBy?: string;
  config?: Record<string, unknown> | string;
  agent_count?: number;
  agents?: unknown[];
  tasks?: unknown[];
  workflows?: unknown[];
}

// 团队列表响应
export interface TeamListResponse {
  items: TeamResponse[];
  total: number;
}

// 团队状态响应
export interface TeamStatusResponse {
  team_id: string;
  total_agents: number;
  active_agents: number;
  busy_agents: number;
  offline_agents: number;
  total_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  average_load: number;
}

// Agent响应
export interface TeamAgentResponse {
  id: string;
  name: string;
  role: string;
  description?: string;
  status: TeamAgentStatus;
  team_id: string;
  capabilities?: string[];
  config?: Record<string, unknown>;
  current_load: number;
  max_load: number;
  availability_score: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  last_active_at?: string;
}

// Agent列表响应
export interface TeamAgentListResponse {
  items: TeamAgentResponse[];
  total: number;
}

// 任务响应
export interface TeamTaskResponse {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  task_type?: string;
  team_id: string;
  assigned_agent_id?: string;
  assigned_agent?: {
    id: string;
    name: string;
    role: string;
    status: string;
  } | null;
  workflow_id?: string;
  requirements?: string[];
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  updated_at: string;
  assigned_at?: string;
  started_at?: string;
  completed_at?: string;
  deadline?: string;
}

// 任务列表响应
export interface TeamTaskListResponse {
  items: TeamTaskResponse[];
  total: number;
}

// 任务分配结果
export interface TaskAssignmentResult {
  task_id: string;
  assigned_agent_id: string;
  agent_name: string;
  assignment_strategy: string;
  success: boolean;
  message: string;
}

// 工作流响应
export interface WorkflowResponse {
  id: string;
  name: string;
  description?: string;
  status: string;
  workflow_type?: string;
  team_id: string;
  definition?: Record<string, unknown>;
  config?: Record<string, unknown>;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  progress_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

// 工作流列表响应
export interface WorkflowListResponse {
  items: WorkflowResponse[];
  total: number;
}

// 错误响应
export interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Team API封装
 */
export const teamsApi = {
  // ==================== 团队管理 ====================

  /**
   * 创建新团队
   */
  createTeam: async (data: CreateTeamRequest): Promise<TeamResponse> => {
    return api.post<TeamResponse>('/teams', data);
  },

  /**
   * 获取团队列表
   */
  listTeams: async (params?: { skip?: number; limit?: number }): Promise<TeamListResponse> => {
    const response = await api.get<TeamResponse[] | TeamListResponse>('/teams', { params });
    if (Array.isArray(response)) {
      return {
        items: response,
        total: response.length,
      };
    }
    return response;
  },

  /**
   * 获取单个团队详情
   */
  getTeam: async (teamId: string): Promise<TeamResponse> => {
    return api.get<TeamResponse>(`/teams/${teamId}`);
  },

  /**
   * 更新团队
   */
  updateTeam: async (teamId: string, data: UpdateTeamRequest): Promise<TeamResponse> => {
    return api.put<TeamResponse>(`/teams/${teamId}`, data);
  },

  /**
   * 删除团队
   */
  deleteTeam: async (teamId: string): Promise<void> => {
    return api.delete(`/teams/${teamId}`);
  },

  /**
   * 获取团队成员
   */
  getTeamMembers: async (
    teamId: string,
    params?: { skip?: number; limit?: number }
  ): Promise<TeamAgentListResponse> => {
    return api.get<TeamAgentListResponse>(`/teams/${teamId}/members`, { params });
  },

  /**
   * 获取团队状态
   */
  getTeamStatus: async (teamId: string): Promise<TeamStatusResponse> => {
    return api.get<TeamStatusResponse>(`/teams/${teamId}/status`);
  },

  // ==================== Agent管理 ====================

  /**
   * 在团队中创建Agent
   */
  createAgent: async (teamId: string, data: CreateTeamAgentRequest): Promise<TeamAgentResponse> => {
    return api.post<TeamAgentResponse>(`/teams/${teamId}/agents`, data);
  },

  /**
   * 获取Agent详情
   */
  getAgent: async (agentId: string): Promise<TeamAgentResponse> => {
    return api.get<TeamAgentResponse>(`/agents/${agentId}`);
  },

  /**
   * 更新Agent
   */
  updateAgent: async (agentId: string, data: UpdateTeamAgentRequest): Promise<TeamAgentResponse> => {
    return api.put<TeamAgentResponse>(`/agents/${agentId}`, data);
  },

  /**
   * 更新Agent状态
   */
  updateAgentStatus: async (
    agentId: string,
    data: UpdateAgentStatusRequest
  ): Promise<TeamAgentResponse> => {
    return api.put<TeamAgentResponse>(`/agents/${agentId}/status`, data);
  },

  /**
   * 删除Agent
   */
  deleteAgent: async (agentId: string): Promise<void> => {
    return api.delete(`/agents/${agentId}`);
  },

  // ==================== 任务管理 ====================

  /**
   * 在团队中创建任务
   */
  createTask: async (teamId: string, data: CreateTeamTaskRequest): Promise<TeamTaskResponse> => {
    return api.post<TeamTaskResponse>(`/teams/${teamId}/tasks`, data);
  },

  /**
   * 获取团队任务列表
   */
  listTasks: async (
    teamId: string,
    params?: { status?: string; skip?: number; limit?: number }
  ): Promise<TeamTaskListResponse> => {
    return api.get<TeamTaskListResponse>(`/teams/${teamId}/tasks`, { params });
  },

  /**
   * 获取任务详情
   */
  getTask: async (taskId: string): Promise<TeamTaskResponse> => {
    return api.get<TeamTaskResponse>(`/tasks/${taskId}`);
  },

  /**
   * 分配任务
   */
  assignTask: async (taskId: string, data: AssignTeamTaskRequest): Promise<TaskAssignmentResult> => {
    return api.post<TaskAssignmentResult>(`/tasks/${taskId}/assign`, data);
  },

  /**
   * 更新任务状态
   */
  updateTaskStatus: async (
    taskId: string,
    status: string,
    result?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<TeamTaskResponse> => {
    return api.put<TeamTaskResponse>(`/tasks/${taskId}/status`, {
      status,
      result,
      error_message: errorMessage,
    });
  },

  /**
   * 删除任务
   */
  deleteTask: async (taskId: string): Promise<void> => {
    return api.delete(`/tasks/${taskId}`);
  },

  // ==================== 工作流管理 ====================

  /**
   * 在团队中创建工作流
   */
  createWorkflow: async (teamId: string, data: CreateWorkflowRequest): Promise<WorkflowResponse> => {
    return api.post<WorkflowResponse>(`/teams/${teamId}/workflows`, data);
  },

  /**
   * 获取团队工作流列表
   */
  listWorkflows: async (
    teamId: string,
    params?: { status?: string; skip?: number; limit?: number }
  ): Promise<WorkflowListResponse> => {
    return api.get<WorkflowListResponse>(`/teams/${teamId}/workflows`, { params });
  },

  /**
   * 获取工作流详情
   */
  getWorkflow: async (workflowId: string): Promise<WorkflowResponse> => {
    return api.get<WorkflowResponse>(`/workflows/${workflowId}`);
  },

  /**
   * 更新工作流
   */
  updateWorkflow: async (workflowId: string, data: UpdateWorkflowRequest): Promise<WorkflowResponse> => {
    return api.put<WorkflowResponse>(`/workflows/${workflowId}`, data);
  },

  /**
   * 控制工作流
   */
  controlWorkflow: async (workflowId: string, data: WorkflowActionRequest): Promise<WorkflowResponse> => {
    return api.post<WorkflowResponse>(`/workflows/${workflowId}/control`, data);
  },

  /**
   * 获取工作流进度
   */
  getWorkflowProgress: async (workflowId: string): Promise<WorkflowResponse> => {
    return api.get<WorkflowResponse>(`/workflows/${workflowId}/progress`);
  },

  /**
   * 删除工作流
   */
  deleteWorkflow: async (workflowId: string): Promise<void> => {
    return api.delete(`/workflows/${workflowId}`);
  },
};
