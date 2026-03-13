import { api } from './client';

export interface SwarmSessionAgentResponse {
  id: string;
  name: string;
  role: string;
  kind: string;
  status: string;
  description?: string;
  capabilities?: string[];
  created_at: string;
  updated_at: string;
  swarm_session_id: string;
}

export interface SwarmSessionTaskResponse {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_agent_id?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  deadline?: string;
}

export interface ExternalMessageResponse {
  id: string;
  swarm_session_id: string;
  sender_type: 'user' | 'lead';
  sender_id?: string;
  content: string;
  message_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SwarmSessionResponse {
  id: string;
  title: string;
  goal?: string;
  status: string;
  mode: string;
  lead_agent_id?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  last_message?: ExternalMessageResponse;
  agents: SwarmSessionAgentResponse[];
  tasks: SwarmSessionTaskResponse[];
}

export interface SwarmSessionListResponse {
  items: SwarmSessionResponse[];
  total: number;
}

export interface SwarmSessionMonitorResponse {
  session: SwarmSessionResponse;
  metrics: {
    total_agents: number;
    active_agents: number;
    busy_agents: number;
    total_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    context_entries: number;
    internal_threads: number;
    internal_messages: number;
  };
}

export interface CreateSwarmSessionRequest {
  title?: string;
  goal?: string;
  mode?: string;
  description?: string;
}

export interface SendExternalMessageRequest {
  content: string;
  message_type?: string;
  metadata?: Record<string, unknown>;
}

export const swarmSessionsApi = {
  listSessions: async (): Promise<SwarmSessionListResponse> => {
    return api.get<SwarmSessionListResponse>('/swarm-sessions');
  },

  createSession: async (data: CreateSwarmSessionRequest): Promise<SwarmSessionResponse> => {
    return api.post<SwarmSessionResponse>('/swarm-sessions', data);
  },

  getSession: async (sessionId: string): Promise<SwarmSessionResponse> => {
    return api.get<SwarmSessionResponse>(`/swarm-sessions/${sessionId}`);
  },

  updateSession: async (sessionId: string, data: Partial<CreateSwarmSessionRequest> & { status?: string }): Promise<SwarmSessionResponse> => {
    return api.patch<SwarmSessionResponse>(`/swarm-sessions/${sessionId}`, data);
  },

  deleteSession: async (sessionId: string): Promise<{ deleted: true }> => {
    return api.delete<{ deleted: true }>(`/swarm-sessions/${sessionId}`);
  },

  getMonitor: async (sessionId: string): Promise<SwarmSessionMonitorResponse> => {
    return api.get<SwarmSessionMonitorResponse>(`/swarm-sessions/${sessionId}/monitor`);
  },

  getExternalMessages: async (sessionId: string): Promise<{ items: ExternalMessageResponse[]; total: number }> => {
    return api.get<{ items: ExternalMessageResponse[]; total: number }>(`/swarm-sessions/${sessionId}/external/messages`);
  },

  sendExternalMessage: async (sessionId: string, data: SendExternalMessageRequest): Promise<ExternalMessageResponse> => {
    return api.post<ExternalMessageResponse>(`/swarm-sessions/${sessionId}/external/messages`, data);
  },

  getSessionTasks: async (sessionId: string): Promise<{ items: SwarmSessionTaskResponse[]; total: number }> => {
    return api.get<{ items: SwarmSessionTaskResponse[]; total: number }>(`/swarm-sessions/${sessionId}/tasks`);
  },

  createSessionTask: async (sessionId: string, data: Record<string, unknown>): Promise<SwarmSessionTaskResponse> => {
    return api.post<SwarmSessionTaskResponse>(`/swarm-sessions/${sessionId}/tasks`, data);
  },
};
