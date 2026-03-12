/**
 * WebSocket Context
 * 迁移自 React SPA: frontend/src/contexts/WebSocketContext.tsx
 */

'use client';

import { createContext, useContext, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useAgentWebSocket, type AgentStatusUpdate, type TaskStatusUpdate, type SystemNotification } from '@/hooks/use-agent-websocket';
import type { AgentMessage } from '@/types/agent';

interface WebSocketContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  connectionAttempts: number;
  agents: Map<string, AgentStatusUpdate>;
  tasks: Map<string, TaskStatusUpdate>;
  messages: AgentMessage[];
  notifications: SystemNotification[];
  subscribeToAgent: (agentId: string) => void;
  subscribeToTask: (taskId: string) => void;
  subscribeToAllAgents: () => void;
  subscribeToAllTasks: () => void;
  unsubscribeFromAgent: (agentId: string) => void;
  unsubscribeFromTask: (taskId: string) => void;
  sendChatMessage: (agentId: string, content: string, conversationId?: string) => boolean;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  clientId: string;
  token?: string;
  onAgentStatus?: (update: AgentStatusUpdate) => void;
  onTaskUpdate?: (update: TaskStatusUpdate) => void;
  onChatMessage?: (message: AgentMessage) => void;
  onSystemNotification?: (notification: SystemNotification) => void;
  autoConnect?: boolean;
}

export function WebSocketProvider({
  children,
  clientId,
  token,
  onAgentStatus,
  onTaskUpdate,
  onChatMessage,
  onSystemNotification,
  autoConnect = true,
}: WebSocketProviderProps) {
  const callbacksRef = useRef({
    onAgentStatus,
    onTaskUpdate,
    onChatMessage,
    onSystemNotification,
  });

  // Keep callbacks ref in sync using useEffect
  useEffect(() => {
    callbacksRef.current = {
      onAgentStatus,
      onTaskUpdate,
      onChatMessage,
      onSystemNotification,
    };
  }, [onAgentStatus, onTaskUpdate, onChatMessage, onSystemNotification]);

  const handleAgentStatus = useCallback((update: AgentStatusUpdate) => {
    callbacksRef.current.onAgentStatus?.(update);
  }, []);

  const handleTaskUpdate = useCallback((update: TaskStatusUpdate) => {
    callbacksRef.current.onTaskUpdate?.(update);
  }, []);

  const handleChatMessage = useCallback((message: AgentMessage) => {
    callbacksRef.current.onChatMessage?.(message);
  }, []);

  const handleSystemNotification = useCallback((notification: SystemNotification) => {
    callbacksRef.current.onSystemNotification?.(notification);
  }, []);

  const ws = useAgentWebSocket({
    clientId,
    token,
    onAgentStatus: handleAgentStatus,
    onTaskUpdate: handleTaskUpdate,
    onChatMessage: handleChatMessage,
    onSystemNotification: handleSystemNotification,
    autoConnect,
  });

  const value: WebSocketContextValue = {
    isConnected: ws.isConnected,
    isConnecting: ws.isConnecting,
    connectionAttempts: ws.connectionAttempts,
    agents: ws.agents,
    tasks: ws.tasks,
    messages: ws.messages,
    notifications: ws.notifications,
    subscribeToAgent: ws.subscribeToAgent,
    subscribeToTask: ws.subscribeToTask,
    subscribeToAllAgents: ws.subscribeToAllAgents,
    subscribeToAllTasks: ws.subscribeToAllTasks,
    unsubscribeFromAgent: ws.unsubscribeFromAgent,
    unsubscribeFromTask: ws.unsubscribeFromTask,
    sendChatMessage: ws.sendChatMessage,
    connect: ws.connect,
    disconnect: ws.disconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

export default WebSocketContext;
