import { api } from './client';

// Re-export type from API route
export interface AgentActivityItem {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: 'lead' | 'teammate';
  agentKind: string;
  activityType: 'thinking' | 'tool_call' | 'tool_result' | 'assistant_response' | 'bubble';
  content: string;
  metadata?: {
    toolName?: string;
    toolInput?: string;
    isError?: boolean;
    toolCallId?: string; // For matching tool_call with tool_result
    model?: string;
  };
  createdAt: string;
}

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
   dependency_ids?: string[];
   is_locked?: boolean;
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
  workspace_id: string;
  lead_agent_id?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  pinned_at?: string;
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
    model_context_size: number;
    llm_usage: {
      session: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_tokens: number;
        cache_read_tokens: number;
        total_tokens: number;
        total_processed_input_tokens: number;
        cache_hit_rate: number;
      };
      lead_agent_id?: string;
      lead: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_tokens: number;
        cache_read_tokens: number;
        total_tokens: number;
        total_processed_input_tokens: number;
        cache_hit_rate: number;
      };
      lead_last_call_context_tokens: number;
      teammates: Array<{
        agent_id: string;
        agent_name: string;
        role: string;
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_creation_tokens: number;
          cache_read_tokens: number;
          total_tokens: number;
          total_processed_input_tokens: number;
          cache_hit_rate: number;
        };
        last_call_context_tokens: number;
      }>;
    };
    lead_self_todos: Array<{
      id: string;
      title: string;
      details?: string;
      status: string;
      category: string;
      updated_at: string;
    }>;
  };
}

export interface CreateSwarmSessionRequest {
  workspaceId: string;
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

export interface AgentActivityItem {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: 'lead' | 'teammate';
  agentKind: string;
  activityType: 'thinking' | 'tool_call' | 'tool_result' | 'assistant_response' | 'bubble';
  content: string;
  metadata?: {
    toolName?: string;
    toolInput?: string;
    isError?: boolean;
    toolCallId?: string;
    model?: string;
  };
  createdAt: string;
}

// Deprecated: old aggregated format, kept for reference
export interface AgentActivityResponse {
  agentId: string;
  agentName: string;
  agentRole: 'lead' | 'teammate';
  agentKind: string;
  thinkingContent?: string[];
  toolCalls?: Array<{
    toolName: string;
    status: 'calling' | 'completed' | 'error';
    inputSummary?: string;
    resultSummary?: string;
    timestamp: string;
  }>;
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

  getSessionStatus: async (sessionId: string): Promise<{ venvReady: boolean; workspaceReady: boolean; venvStatus: 'initializing' | 'ready' | 'error' }> => {
    return api.get<{ venvReady: boolean; workspaceReady: boolean; venvStatus: 'initializing' | 'ready' | 'error' }>(`/swarm-sessions/${sessionId}/status`);
  },

  retryVenvSetup: async (sessionId: string): Promise<{ venvReady: boolean; workspaceReady: boolean; venvStatus: 'initializing' | 'ready' | 'error' }> => {
    return api.post<{ venvReady: boolean; workspaceReady: boolean; venvStatus: 'initializing' | 'ready' | 'error' }>(`/swarm-sessions/${sessionId}/venv/retry`);
  },

  getVenvPackages: async (sessionId: string): Promise<{ packages: Array<{ name: string; version: string }> }> => {
    return api.get<{ packages: Array<{ name: string; version: string }> }>(`/swarm-sessions/${sessionId}/venv/packages`);
  },

  venvPackageAction: async (sessionId: string, action: 'install' | 'uninstall' | 'upgrade', packages: string[]): Promise<{ success: boolean; output: string; error?: string }> => {
    return api.post<{ success: boolean; output: string; error?: string }>(`/swarm-sessions/${sessionId}/venv/packages/action`, { action, packages });
  },

  updateSession: async (sessionId: string, data: Partial<CreateSwarmSessionRequest> & { status?: string; isPinned?: boolean }): Promise<SwarmSessionResponse> => {
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

  getAgentActivities: async (sessionId: string): Promise<{ items: AgentActivityItem[]; total: number }> => {
    return api.get<{ items: AgentActivityItem[]; total: number }>(`/swarm-sessions/${sessionId}/agent-activities`);
  },

  pauseSession: async (sessionId: string): Promise<{ pausedAgents: number; message: string }> => {
    return api.post<{ pausedAgents: number; message: string }>(`/swarm-sessions/${sessionId}/pause`);
  },

  resumeSession: async (sessionId: string): Promise<{ resumedAgents: number; pendingTasks: number; message: string }> => {
    return api.post<{ resumedAgents: number; pendingTasks: number; message: string }>(`/swarm-sessions/${sessionId}/resume`);
  },

  // Share management
  createShare: async (sessionId: string): Promise<SessionShareResponse> => {
    return api.post<SessionShareResponse>(`/swarm-sessions/${sessionId}/shares`);
  },

  listShares: async (sessionId: string): Promise<{ items: SessionShareResponse[]; total: number }> => {
    return api.get<{ items: SessionShareResponse[]; total: number }>(`/swarm-sessions/${sessionId}/shares`);
  },

  deleteShare: async (sessionId: string, shareId: string): Promise<{ deleted: true }> => {
    return api.delete<{ deleted: true }>(`/swarm-sessions/${sessionId}/shares/${shareId}`);
  },
};

export interface SessionShareResponse {
  id: string;
  shareToken: string;
  snapshotTitle: string;
  createdAt: string;
}
