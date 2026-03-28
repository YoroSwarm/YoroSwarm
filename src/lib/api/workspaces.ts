import { api } from './client';

export interface WorkspaceResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  sessionCount: number;
  activeSessionCount: number;
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
}

export interface WorkspaceListResponse {
  items: WorkspaceResponse[];
  total: number;
}

export interface WorkspaceStatusResponse {
  venvReady: boolean;
  workspaceReady: boolean;
  venvStatus: 'initializing' | 'ready' | 'error';
}

export const workspacesApi = {
  listWorkspaces: async (): Promise<WorkspaceListResponse> => {
    return api.get<WorkspaceListResponse>('/workspaces');
  },

  createWorkspace: async (data: CreateWorkspaceRequest): Promise<WorkspaceResponse> => {
    return api.post<WorkspaceResponse>('/workspaces', data);
  },

  getWorkspace: async (workspaceId: string): Promise<WorkspaceResponse> => {
    return api.get<WorkspaceResponse>(`/workspaces/${workspaceId}`);
  },

  updateWorkspace: async (workspaceId: string, data: UpdateWorkspaceRequest): Promise<WorkspaceResponse> => {
    return api.patch<WorkspaceResponse>(`/workspaces/${workspaceId}`, data);
  },

  deleteWorkspace: async (workspaceId: string): Promise<{ deleted: true }> => {
    return api.delete<{ deleted: true }>(`/workspaces/${workspaceId}`);
  },

  getWorkspaceStatus: async (workspaceId: string): Promise<WorkspaceStatusResponse> => {
    return api.get<WorkspaceStatusResponse>(`/workspaces/${workspaceId}/status`);
  },

  retryVenvSetup: async (workspaceId: string): Promise<WorkspaceStatusResponse> => {
    return api.post<WorkspaceStatusResponse>(`/workspaces/${workspaceId}/venv/retry`);
  },
};
