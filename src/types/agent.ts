export type AgentStatus = 'online' | 'offline' | 'busy' | 'idle' | 'error';

export type AgentType = 'leader' | 'worker' | 'specialist' | 'coordinator';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  currentTask?: string;
  load: number;
  avatar?: string;
  description?: string;
  expertise?: string[];
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  completedTasks: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  type: 'message' | 'action' | 'error' | 'system';
  timestamp: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
}

export interface AgentActivity {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  details?: string;
  timestamp: string;
}

export type Activity = AgentActivity;
