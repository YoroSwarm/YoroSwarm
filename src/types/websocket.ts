export type WebSocketMessageType =
  | 'connected'
  | 'disconnected'
  | 'message'
  | 'agent_status'
  | 'execution_update'
  | 'task_update'
  | 'chat_message'
  | 'internal_message'
  | 'agent_thinking'
  | 'tool_activity'
  | 'system'
  | 'broadcast'
  | 'presence'
  | 'typing'
  | 'read_receipt'
  | 'ping'
  | 'pong'
  | 'ack'
  | 'error'
  | 'subscribed'
  | 'unsubscribed'
  | 'message_received';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: unknown;
  message_id?: string;
  requires_ack?: boolean;
}

export type AgentStatus = 'created' | 'initializing' | 'idle' | 'busy' | 'running' | 'paused' | 'terminating' | 'terminated' | 'error';

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface AgentStatusUpdate {
  agent_id: string;
  name: string;
  status: AgentStatus;
  current_task_id?: string;
  total_tasks_completed: number;
  total_tasks_failed: number;
  last_active_at?: string;
  swarm_session_id?: string;
  message?: string;
  timestamp: string;
}

export interface ExecutionStatusUpdate {
  execution_id: string;
  agent_id: string;
  agent_name: string;
  swarm_session_id: string;
  status: 'active' | 'interrupted' | 'completed' | 'cancelled';
  kind: 'message_batch' | 'deep_work' | 'tool_driven' | 'recovery' | 'idle';
  description: string;
  work_unit_key?: string;
  interruption_count: number;
  source_message_ids?: string[];
  timestamp: string;
}

export interface TaskStatusUpdate {
  task_id: string;
  title: string;
  status: TaskStatus;
  assignee_id?: string;
  assignee_name?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress?: number;
  message?: string;
  swarm_session_id?: string;
  timestamp: string;
}

export interface SystemNotification {
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ChatMessagePayload {
  id: string;
  content: string;
  type: 'text' | 'task_update' | 'agent_status' | 'system' | 'file' | 'broadcast';
  sender_id: string;
  sender_name?: string;
  swarm_session_id?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, unknown>;
  read_at?: string;
  created_at?: string;
  timestamp: string;
}

export interface PresenceUpdate {
  user_id: string;
  status: 'online' | 'away' | 'offline';
  timestamp: string;
}

export interface TypingIndicator {
  user_id: string;
  swarm_session_id: string;
  is_typing: boolean;
  timestamp: string;
}

export interface ReadReceipt {
  user_id: string;
  message_id: string;
  swarm_session_id: string;
  read_at: string;
}

export interface AgentThinkingPayload {
  agent_id: string;
  agent_name: string;
  swarm_session_id: string;
  status: 'start' | 'thinking' | 'end';
  content?: string;
  timestamp: string;
  seq?: number;
}

export interface ToolActivityPayload {
  agent_id: string;
  agent_name: string;
  swarm_session_id: string;
  tool_call_id: string;
  tool_name: string;
  status: 'calling' | 'completed' | 'error';
  input_summary?: string;
  result_summary?: string;
  timestamp: string;
  seq?: number;
}

export interface WebSocketSubscription {
  target: 'all' | 'session' | 'agent' | 'task' | 'all_agents' | 'all_tasks';
  id?: string;
}
