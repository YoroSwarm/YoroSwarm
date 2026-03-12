import { api } from './client';
import type { Task } from '@/types/agent';

// 任务状态
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

// 创建任务请求
export interface CreateTaskRequest {
  title: string;
  description: string;
  priority?: TaskPriority;
  task_type?: string;
  requirements?: string[];
  input_data?: Record<string, unknown>;
  deadline?: string;
  dependency_ids?: number[];
}

// 更新任务请求
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  requirements?: string[];
  input_data?: Record<string, unknown>;
  deadline?: string | null;
}

// 任务状态更新请求
export interface TaskStatusUpdateRequest {
  status: TaskStatus;
  result?: Record<string, unknown>;
  error_message?: string;
}

// 任务分配请求
export interface TaskAssignRequest {
  agent_id?: string;
  strategy?: 'auto' | 'round_robin' | 'least_loaded' | 'capability_match';
}

// 任务响应
export interface TaskResponse extends Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  task_type?: string;
  team_id?: string;
  assigned_agent_id?: string;
  assigned_agent?: {
    id: string;
    name: string;
    role: string;
    status: string;
  } | null;
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
  is_locked?: boolean;
}

// 任务列表响应
export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
}

// 依赖链响应
export interface DependencyChainResponse {
  task_id: number;
  direction: 'up' | 'down';
  chain: Array<{
    id: number;
    title: string;
    status: string;
    is_blocking: boolean;
  }>;
}

// 就绪任务响应
export interface ReadyTasksResponse {
  tasks: TaskResponse[];
  count: number;
}

// 任务解锁事件
export interface TaskUnlockEvent {
  task_id: number;
  title: string;
  unlocked_by: number;
}

// 状态更新响应
export interface TaskStatusUpdateResponse {
  task: TaskResponse;
  unlocked_tasks: TaskUnlockEvent[];
}

// 批量状态更新请求
export interface BulkStatusUpdateRequest {
  task_ids: number[];
  status: TaskStatus;
}

// 批量状态更新响应
export interface BulkStatusUpdateResponse {
  updated: number[];
  failed: number[];
  updated_count: number;
  failed_count: number;
}

// 添加依赖请求
export interface AddDependencyRequest {
  dependency_id: number;
  is_blocking?: boolean;
}

/**
 * Task API封装
 */
export const tasksApi = {
  /**
   * 创建新任务
   */
  createTask: async (data: CreateTaskRequest): Promise<TaskResponse> => {
    return api.post<TaskResponse>('/tasks', data);
  },

  /**
   * 获取任务列表
   */
  listTasks: async (params?: {
    skip?: number;
    limit?: number;
    status?: TaskStatus;
    assignee_id?: string;
    team_id?: string;
    priority?: TaskPriority;
    is_locked?: boolean;
    search?: string;
  }): Promise<TaskListResponse> => {
    return api.get<TaskListResponse>('/tasks', { params });
  },

  /**
   * 获取单个任务详情
   */
  getTask: async (taskId: number | string): Promise<TaskResponse> => {
    return api.get<TaskResponse>(`/tasks/${taskId}`);
  },

  /**
   * 更新任务
   */
  updateTask: async (taskId: number | string, data: UpdateTaskRequest): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}`, data);
  },

  /**
   * 删除任务
   */
  deleteTask: async (taskId: number | string): Promise<void> => {
    return api.delete(`/tasks/${taskId}`);
  },

  /**
   * 更新任务状态
   */
  updateTaskStatus: async (
    taskId: number | string,
    data: TaskStatusUpdateRequest
  ): Promise<TaskStatusUpdateResponse> => {
    return api.put<TaskStatusUpdateResponse>(`/tasks/${taskId}/status`, data);
  },

  /**
   * 分配任务给Agent
   */
  assignTask: async (
    taskId: number | string,
    data: TaskAssignRequest
  ): Promise<{
    task_id: string;
    assigned_agent_id: string;
    agent_name: string;
    assignment_strategy: string;
    success: boolean;
    message: string;
  }> => {
    return api.post(`/tasks/${taskId}/assign`, data);
  },

  /**
   * 认领任务
   */
  claimTask: async (taskId: number | string): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}/claim`);
  },

  /**
   * 取消任务分配
   */
  unassignTask: async (taskId: number | string): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}/unassign`);
  },

  /**
   * 添加任务依赖
   */
  addDependency: async (
    taskId: number | string,
    data: AddDependencyRequest
  ): Promise<TaskResponse> => {
    return api.post<TaskResponse>(`/tasks/${taskId}/dependencies`, data);
  },

  /**
   * 移除任务依赖
   */
  removeDependency: async (
    taskId: number | string,
    dependencyId: number | string
  ): Promise<TaskResponse> => {
    return api.delete<TaskResponse>(`/tasks/${taskId}/dependencies/${dependencyId}`);
  },

  /**
   * 获取任务依赖链
   */
  getDependencyChain: async (
    taskId: number | string,
    direction: 'up' | 'down' = 'up'
  ): Promise<DependencyChainResponse> => {
    return api.get<DependencyChainResponse>(`/tasks/${taskId}/dependencies/chain`, {
      params: { direction },
    });
  },

  /**
   * 获取Agent的任务列表
   */
  getAgentTasks: async (
    agentId: string,
    status?: TaskStatus
  ): Promise<TaskResponse[]> => {
    return api.get<TaskResponse[]>(`/tasks/agent/${agentId}`, {
      params: status ? { status } : undefined,
    });
  },

  /**
   * 获取就绪任务列表
   */
  getReadyTasks: async (teamId?: string): Promise<ReadyTasksResponse> => {
    return api.get<ReadyTasksResponse>('/tasks/ready/list', {
      params: teamId ? { team_id: teamId } : undefined,
    });
  },

  /**
   * 批量更新任务状态
   */
  bulkUpdateStatus: async (data: BulkStatusUpdateRequest): Promise<BulkStatusUpdateResponse> => {
    return api.post<BulkStatusUpdateResponse>('/tasks/bulk/status', data);
  },

  /**
   * 获取团队任务列表
   */
  getTeamTasks: async (
    teamId: string,
    params?: {
      status?: TaskStatus;
      skip?: number;
      limit?: number;
    }
  ): Promise<TaskListResponse> => {
    return api.get<TaskListResponse>(`/teams/${teamId}/tasks`, { params });
  },
};
