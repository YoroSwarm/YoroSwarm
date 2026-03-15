/**
 * Agent WebSocket Hook
 * 迁移自 React SPA: frontend/src/hooks/useAgentWebSocket.ts
 * 适配 Next.js 环境变量
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket, type WebSocketMessage } from './use-websocket';
import type { AgentMessage } from '@/types/agent';
import type { ExecutionStatusUpdate } from '@/types/websocket';

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

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

export interface InternalMessageUpdate {
  message_id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  recipient_id?: string;
  recipient_name?: string;
  message_type: string;
  content: string;
  swarm_session_id?: string;
  timestamp: string;
}

export interface UseAgentWebSocketOptions {
  clientId?: string;
  token?: string;
  sessionId?: string;
  swarmSessionId?: string;
  path?: string;
  scopePath?: string;
  onAgentStatus?: (update: AgentStatusUpdate) => void;
  onTaskUpdate?: (update: TaskStatusUpdate) => void;
  onChatMessage?: (message: AgentMessage) => void;
  onSystemNotification?: (notification: SystemNotification) => void;
  onInternalMessage?: (message: InternalMessageUpdate) => void;
  onExecutionUpdate?: (update: ExecutionStatusUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: (code?: number, reason?: string) => void;
  autoConnect?: boolean;
}

export interface UseAgentWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionAttempts: number;
  agents: Map<string, AgentStatusUpdate>;
  tasks: Map<string, TaskStatusUpdate>;
  messages: AgentMessage[];
  notifications: SystemNotification[];
  internalMessages: InternalMessageUpdate[];
  executions: Map<string, ExecutionStatusUpdate>;
  subscribeToAgent: (agentId: string) => void;
  subscribeToTask: (taskId: string) => void;
  subscribeToAllAgents: () => void;
  subscribeToAllTasks: () => void;
  unsubscribeFromAgent: (agentId: string) => void;
  unsubscribeFromTask: (taskId: string) => void;
  unsubscribeFromAllAgents: () => void;
  unsubscribeFromAllTasks: () => void;
  sendChatMessage: (agentId: string, content: string, swarmSessionId?: string) => boolean;
  connect: () => void;
  disconnect: () => void;
}

export function useAgentWebSocket({
  clientId,
  token,
  sessionId,
  swarmSessionId,
  path,
  scopePath,
  onAgentStatus,
  onTaskUpdate,
  onChatMessage,
  onSystemNotification,
  onInternalMessage,
  onExecutionUpdate,
  onConnect,
  onDisconnect,
  autoConnect = true,
}: UseAgentWebSocketOptions): UseAgentWebSocketReturn {
  const [agents, setAgents] = useState<Map<string, AgentStatusUpdate>>(new Map());
  const [tasks, setTasks] = useState<Map<string, TaskStatusUpdate>>(new Map());
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [internalMessages, setInternalMessages] = useState<InternalMessageUpdate[]>([]);
  const [executions, setExecutions] = useState<Map<string, ExecutionStatusUpdate>>(new Map());

  const agentsRef = useRef(agents);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'agent_status': {
        const update = message.payload as AgentStatusUpdate;
        setAgents(prev => new Map(prev).set(update.agent_id, update));
        onAgentStatus?.(update);
        break;
      }

      case 'task_update': {
        const update = message.payload as TaskStatusUpdate;
        setTasks(prev => new Map(prev).set(update.task_id, update));
        onTaskUpdate?.(update);
        break;
      }

      case 'chat_message': {
        const msg = message.payload as AgentMessage;
        setMessages(prev => [...prev, msg]);
        onChatMessage?.(msg);
        break;
      }

      case 'system': {
        const notification = message.payload as SystemNotification;
        setNotifications(prev => [...prev.slice(-49), notification]);
        onSystemNotification?.(notification);
        break;
      }

      case 'internal_message': {
        const internalMsg = message.payload as InternalMessageUpdate;
        setInternalMessages(prev => [...prev.slice(-99), internalMsg]);
        onInternalMessage?.(internalMsg);
        break;
      }

      case 'execution_update': {
        const update = message.payload as ExecutionStatusUpdate;
        setExecutions(prev => new Map(prev).set(update.agent_id, update));
        onExecutionUpdate?.(update);
        break;
      }

      case 'broadcast': {
        const payload = message.payload as { type: string; data: unknown };
        if (payload.type === 'agent_status') {
          const update = payload.data as AgentStatusUpdate;
          setAgents(prev => new Map(prev).set(update.agent_id, update));
          onAgentStatus?.(update);
        } else if (payload.type === 'task_update') {
          const update = payload.data as TaskStatusUpdate;
          setTasks(prev => new Map(prev).set(update.task_id, update));
          onTaskUpdate?.(update);
        }
        break;
      }
    }
  }, [onAgentStatus, onTaskUpdate, onChatMessage, onSystemNotification, onInternalMessage, onExecutionUpdate]);

  const query = new URLSearchParams();
  if (token) query.set('token', token);
  if (clientId) query.set('clientId', clientId);
  if (swarmSessionId || sessionId) query.set('sessionId', swarmSessionId || sessionId || '');

  const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
  const resolvedScopePath = scopePath
    || path
    || (swarmSessionId || sessionId ? `/ws/sessions/${swarmSessionId || sessionId}` : clientId ? `/ws/agents/${clientId}` : '/ws');
  const wsUrl = typeof window !== 'undefined'
    ? `${baseUrl.replace(/\/$/, '')}${resolvedScopePath}${query.size ? `?${query.toString()}` : ''}`
    : '';

  const {
    isConnected,
    isConnecting,
    connectionAttempts,
    sendMessage,
    connect,
    disconnect,
  } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onConnect,
    onDisconnect,
    autoConnect,
    heartbeatInterval: 30000,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  });

  const subscribeToAgent = useCallback((agentId: string) => {
    sendMessage({
      type: 'subscribe',
      payload: { target: 'agent', id: agentId }
    });
  }, [sendMessage]);

  const subscribeToTask = useCallback((taskId: string) => {
    sendMessage({
      type: 'subscribe',
      payload: { target: 'task', id: taskId }
    });
  }, [sendMessage]);

  const subscribeToAllAgents = useCallback(() => {
    sendMessage({
      type: 'subscribe',
      payload: { target: 'all_agents' }
    });
  }, [sendMessage]);

  const subscribeToAllTasks = useCallback(() => {
    sendMessage({
      type: 'subscribe',
      payload: { target: 'all_tasks' }
    });
  }, [sendMessage]);

  const unsubscribeFromAgent = useCallback((agentId: string) => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target: 'agent', id: agentId }
    });
  }, [sendMessage]);

  const unsubscribeFromTask = useCallback((taskId: string) => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target: 'task', id: taskId }
    });
  }, [sendMessage]);

  const unsubscribeFromAllAgents = useCallback(() => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target: 'all_agents' }
    });
  }, [sendMessage]);

  const unsubscribeFromAllTasks = useCallback(() => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target: 'all_tasks' }
    });
  }, [sendMessage]);

  const sendChatMessage = useCallback((agentId: string, content: string, resolvedSessionId?: string): boolean => {
    return sendMessage({
      type: 'chat_message',
      payload: {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        agent_id: agentId,
        agent_name: 'User',
        content,
        type: 'message',
        swarm_session_id: resolvedSessionId,
        timestamp: new Date().toISOString(),
      }
    });
  }, [sendMessage]);

  useEffect(() => {
    if (isConnected) {
      subscribeToAllAgents();
      subscribeToAllTasks();
    }
  }, [isConnected, subscribeToAllAgents, subscribeToAllTasks]);

  return {
    isConnected,
    isConnecting,
    connectionAttempts,
    agents,
    tasks,
    messages,
    notifications,
    internalMessages,
    executions,
    subscribeToAgent,
    subscribeToTask,
    subscribeToAllAgents,
    subscribeToAllTasks,
    unsubscribeFromAgent,
    unsubscribeFromTask,
    unsubscribeFromAllAgents,
    unsubscribeFromAllTasks,
    sendChatMessage,
    connect,
    disconnect,
  };
}

export default useAgentWebSocket;
