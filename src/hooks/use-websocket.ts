/**
 * WebSocket Hook
 * 迁移自 React SPA: frontend/src/hooks/useWebSocket.ts
 * 适配 Next.js 环境变量
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export type WebSocketMessageType =
  | 'connected'
  | 'disconnected'
  | 'message'
  | 'agent_status'
  | 'task_update'
  | 'chat_message'
  | 'system'
  | 'broadcast'
  | 'presence'
  | 'typing'
  | 'read_receipt'
  | 'ping'
  | 'pong'
  | 'error'
  | 'subscribe'
  | 'unsubscribe'
  | 'subscribed'
  | 'unsubscribed'
  | 'message_received'
  | 'ack';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: unknown;
  message_id?: string;
  requires_ack?: boolean;
}

export interface UseWebSocketOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: (code?: number, reason?: string) => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  autoConnect?: boolean;
  autoReconnect?: boolean;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionAttempts: number;
  sendMessage: (message: Omit<WebSocketMessage, 'message_id'> & { message_id?: string }) => boolean;
  sendMessageWithAck: (message: Omit<WebSocketMessage, 'message_id'>) => Promise<boolean>;
  connect: () => void;
  disconnect: () => void;
  subscribe: (target: 'agent' | 'task' | 'all_agents' | 'all_tasks', id?: string) => void;
  unsubscribe: (target: 'agent' | 'task' | 'all_agents' | 'all_tasks', id?: string) => void;
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  heartbeatInterval = 30000,
  heartbeatTimeout = 10000,
  autoConnect = true,
  autoReconnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAcksRef = useRef<Map<string, { resolve: (value: boolean) => void; timeout: NodeJS.Timeout }>>(new Map());
  const isManualDisconnectRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const clearReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ping',
          payload: { timestamp: Date.now() }
        }));

        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('Heartbeat timeout, closing connection');
          wsRef.current?.close();
        }, heartbeatTimeout);
      }
    }, heartbeatInterval);
  }, [heartbeatInterval, heartbeatTimeout, clearHeartbeat]);

  const handleAcknowledgment = useCallback((messageId: string) => {
    const pending = pendingAcksRef.current.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(true);
      pendingAcksRef.current.delete(messageId);
    }
  }, []);

  const connect = useCallback(() => {
    if (isConnecting || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    isManualDisconnectRef.current = false;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionAttempts(0);
        startHeartbeat();
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          // Handle pong
          if (message.type === 'pong') {
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            return;
          }

          // Handle acknowledgment responses
          if (message.type === 'message_received' && message.message_id) {
            handleAcknowledgment(message.message_id);
            return;
          }

          // Send acknowledgment if required
          if (message.requires_ack && message.message_id) {
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { message_id: message.message_id }
            }));
          }

          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);
        clearHeartbeat();
        onDisconnect?.(event.code, event.reason);

        // Clear pending acknowledgments
        pendingAcksRef.current.forEach((pending) => {
          clearTimeout(pending.timeout);
          pending.resolve(false);
        });
        pendingAcksRef.current.clear();

        // Auto reconnect if not manually disconnected
        if (autoReconnect && !isManualDisconnectRef.current && connectionAttempts < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            setConnectionAttempts((prev) => prev + 1);
            connectRef.current?.();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectInterval,
    maxReconnectAttempts,
    connectionAttempts,
    autoReconnect,
    startHeartbeat,
    clearHeartbeat,
    handleAcknowledgment,
    isConnecting,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearReconnect();
    clearHeartbeat();

    // Clear pending acknowledgments
    pendingAcksRef.current.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    });
    pendingAcksRef.current.clear();

    wsRef.current?.close();
    wsRef.current = null;
  }, [clearReconnect, clearHeartbeat]);

  const sendMessage = useCallback((message: Omit<WebSocketMessage, 'message_id'> & { message_id?: string }): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const sendMessageWithAck = useCallback((message: Omit<WebSocketMessage, 'message_id'>): Promise<boolean> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        resolve(false);
        return;
      }

      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fullMessage = { ...message, message_id: messageId, requires_ack: true };

      // Set timeout for acknowledgment
      const timeout = setTimeout(() => {
        pendingAcksRef.current.delete(messageId);
        resolve(false);
      }, 10000);

      pendingAcksRef.current.set(messageId, { resolve, timeout });

      wsRef.current.send(JSON.stringify(fullMessage));
    });
  }, []);

  const subscribe = useCallback((target: 'agent' | 'task' | 'all_agents' | 'all_tasks', id?: string) => {
    sendMessage({
      type: 'subscribe',
      payload: { target, id }
    });
  }, [sendMessage]);

  const unsubscribe = useCallback((target: 'agent' | 'task' | 'all_agents' | 'all_tasks', id?: string) => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target, id }
    });
  }, [sendMessage]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (autoConnect) {
      timeoutId = setTimeout(() => {
        connect();
      }, 0);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return useMemo(() => ({
    isConnected,
    isConnecting,
    connectionAttempts,
    sendMessage,
    sendMessageWithAck,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  }), [
    isConnected,
    isConnecting,
    connectionAttempts,
    sendMessage,
    sendMessageWithAck,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  ]);
}

export default useWebSocket;
