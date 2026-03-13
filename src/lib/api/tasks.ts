import { api } from './client';
import type { Task } from '@/types/agent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface CreateTaskRequest {
  title: string;
  description: string;
  priority?: TaskPriority;
  assigneeId?: string;
  swarmSessionId?: string;
  parentId?: string;
  deadline?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  assigned_agent_id?: string | null;
  deadline?: string | null;
}

export interface TaskStatusUpdateRequest {
  status: TaskStatus;
}

export interface TaskAssignRequest {
  agent_id?: string;
  strategy?: 'auto' | 'round_robin' | 'least_loaded' | 'capability_match';
}

export interface TaskResponse extends Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  swarm_session_id?: string;
  assigned_agent_id?: string;
  assigned_agent?: {
    id: string;
    name: string;
    role: string;
    status: string;
  } | null;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  deadline?: string;
  dependency_ids?: string[];
  is_locked?: boolean;
}

export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
}

export interface DependencyChainResponse {
  task_id: string;
  direction: 'up' | 'down';
  chain: Array<{
    id: string;
    title: string;
    status: string;
    is_blocking: boolean;
  }>;
}

export interface ReadyTasksResponse {
  tasks: TaskResponse[];
  count: number;
}

export interface TaskUnlockEvent {
  task_id: string;
  title: string;
  unlocked_by: string;
}

export interface TaskStatusUpdateResponse {
  task: TaskResponse;
  unlocked_tasks: TaskUnlockEvent[];
}

export interface BulkStatusUpdateRequest {
  task_ids: string[];
  status: TaskStatus;
}

export interface BulkStatusUpdateResponse {
  updated: string[];
  failed: string[];
  updated_count: number;
  failed_count: number;
}

export interface AddDependencyRequest {
  dependency_id: string;
}

export const tasksApi = {
  createTask: async (data: CreateTaskRequest): Promise<TaskResponse> => {
    return api.post<TaskResponse>('/tasks', data);
  },

  listTasks: async (params?: {
    skip?: number;
    limit?: number;
    status?: TaskStatus;
    assigneeId?: string;
    swarmSessionId?: string;
    priority?: TaskPriority;
    is_locked?: boolean;
    search?: string;
  }): Promise<TaskListResponse> => {
    return api.get<TaskListResponse>('/tasks', { params });
  },

  getTask: async (taskId: string): Promise<TaskResponse> => {
    return api.get<TaskResponse>(`/tasks/${taskId}`);
  },

  updateTask: async (taskId: string, data: UpdateTaskRequest): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}`, data);
  },

  deleteTask: async (taskId: string): Promise<void> => {
    return api.delete(`/tasks/${taskId}`);
  },

  updateTaskStatus: async (
    taskId: string,
    data: TaskStatusUpdateRequest
  ): Promise<TaskStatusUpdateResponse> => {
    return api.put<TaskStatusUpdateResponse>(`/tasks/${taskId}/status`, data);
  },

  assignTask: async (
    taskId: string,
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

  claimTask: async (taskId: string): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}/claim`);
  },

  unassignTask: async (taskId: string): Promise<TaskResponse> => {
    return api.put<TaskResponse>(`/tasks/${taskId}/unassign`);
  },

  addDependency: async (
    taskId: string,
    data: AddDependencyRequest
  ): Promise<TaskResponse> => {
    return api.post<TaskResponse>(`/tasks/${taskId}/dependencies`, data);
  },

  removeDependency: async (
    taskId: string,
    dependencyId: string
  ): Promise<TaskResponse> => {
    return api.delete<TaskResponse>(`/tasks/${taskId}/dependencies/${dependencyId}`);
  },

  getDependencyChain: async (
    taskId: string,
    direction: 'up' | 'down' = 'up'
  ): Promise<DependencyChainResponse> => {
    return api.get<DependencyChainResponse>(`/tasks/${taskId}/dependencies/chain`, {
      params: { direction },
    });
  },

  getAgentTasks: async (
    agentId: string,
    status?: TaskStatus
  ): Promise<TaskResponse[]> => {
    return api.get<TaskResponse[]>(`/tasks/agent/${agentId}`, {
      params: status ? { status } : undefined,
    });
  },

  getReadyTasks: async (swarmSessionId?: string): Promise<ReadyTasksResponse> => {
    return api.get<ReadyTasksResponse>('/tasks/ready/list', {
      params: swarmSessionId ? { swarmSessionId } : undefined,
    });
  },

  bulkUpdateStatus: async (data: BulkStatusUpdateRequest): Promise<BulkStatusUpdateResponse> => {
    return api.post<BulkStatusUpdateResponse>('/tasks/bulk/status', data);
  },
};
