/**
 * WebSocket Hook
 * 迁移自 React SPA: frontend/src/hooks/useWebSocket.ts
 * 适配 Next.js 环境变量 - 支持 HTTP/WebSocket 共用端口
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

type SubscriptionTarget = 'all' | 'session' | 'agent' | 'task' | 'all_agents' | 'all_tasks';

// 全局连接锁，防止 StrictMode 下的重复连接
const globalConnectingLocks = new Map<string, boolean>();

/**
 * 解析 WebSocket URL
 * - 支持环境变量配置
 * - 默认使用与页面相同的协议/主机/端口
 * - 自动将 http 转换为 ws，https 转换为 wss
 */
function resolveWebSocketUrl(rawUrl: string): string {
  if (!rawUrl || typeof window === 'undefined') {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);

    // 自动转换协议
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'ws:';
    } else if (parsed.protocol === 'https:') {
      parsed.protocol = 'wss:';
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

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
  | 'session_updated'
  | 'session_status'
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
  | 'ack'
  | 'tool_approval_request'
  | 'tool_approval_update';

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
  subscribe: (target: SubscriptionTarget, id?: string) => void;
  unsubscribe: (target: SubscriptionTarget, id?: string) => void;
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 2000,
  maxReconnectAttempts = 20,
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
  const isConnectingRef = useRef(false);
  const connectionAttemptsRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  // Use refs for callbacks to avoid stale closures in WebSocket handlers
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    isConnectingRef.current = isConnecting;
  }, [isConnecting]);

  useEffect(() => {
    connectionAttemptsRef.current = connectionAttempts;
  }, [connectionAttempts]);

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
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // 使用全局锁防止同一 URL 的重复连接（StrictMode 防护）
    if (globalConnectingLocks.get(url)) {
      return;
    }
    globalConnectingLocks.set(url, true);

    isConnectingRef.current = true;
    setIsConnecting(true);
    isManualDisconnectRef.current = false;

    void (async () => {
      const resolvedUrl = resolveWebSocketUrl(url);
      if (!resolvedUrl) {
        isConnectingRef.current = false;
        setIsConnecting(false);
        setIsConnected(false);
        globalConnectingLocks.delete(url);
        return;
      }

      if (isManualDisconnectRef.current) {
        isConnectingRef.current = false;
        setIsConnecting(false);
        globalConnectingLocks.delete(url);
        return;
      }

      try {
        const ws = new WebSocket(resolvedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          isConnectingRef.current = false;
          setIsConnecting(false);
          connectionAttemptsRef.current = 0;
          setConnectionAttempts(0);
          startHeartbeat();
          onConnectRef.current?.();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;

            if (message.type === 'pong') {
              if (heartbeatTimeoutRef.current) {
                clearTimeout(heartbeatTimeoutRef.current);
                heartbeatTimeoutRef.current = null;
              }
              return;
            }

            if (message.type === 'message_received' && message.message_id) {
              handleAcknowledgment(message.message_id);
              return;
            }

            if (message.requires_ack && message.message_id) {
              ws.send(JSON.stringify({
                type: 'ack',
                payload: { message_id: message.message_id }
              }));
            }

            onMessageRef.current?.(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          globalConnectingLocks.delete(url);

          if (wsRef.current === ws) {
            wsRef.current = null;
          }

          setIsConnected(false);
          isConnectingRef.current = false;
          setIsConnecting(false);
          clearHeartbeat();
          onDisconnectRef.current?.(event.code, event.reason);

          pendingAcksRef.current.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.resolve(false);
          });
          pendingAcksRef.current.clear();

          if (autoReconnect && !isManualDisconnectRef.current && connectionAttemptsRef.current < maxReconnectAttempts) {
            // Exponential backoff: base * 2^attempt, capped at 30s
            const backoff = Math.min(reconnectInterval * Math.pow(2, connectionAttemptsRef.current), 30000);
            reconnectTimeoutRef.current = setTimeout(() => {
              setConnectionAttempts((prev) => {
                const next = prev + 1;
                connectionAttemptsRef.current = next;
                return next;
              });
              connectRef.current?.();
            }, backoff);
          }
        };

        ws.onerror = (error) => {
          console.warn('WebSocket error:', {
            url: resolvedUrl,
            readyState: ws.readyState,
            eventType: error.type,
          });
          onErrorRef.current?.(error);
        };
      } catch (error) {
        globalConnectingLocks.delete(url);
        console.error('Failed to connect WebSocket:', { url: resolvedUrl, error });
        isConnectingRef.current = false;
        setIsConnecting(false);
        setIsConnected(false);
      }
    })();
  }, [
    url,
    reconnectInterval,
    maxReconnectAttempts,
    autoReconnect,
    startHeartbeat,
    clearHeartbeat,
    handleAcknowledgment,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    isConnectingRef.current = false;
    clearReconnect();
    clearHeartbeat();

    pendingAcksRef.current.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    });
    pendingAcksRef.current.clear();

    wsRef.current?.close();
    wsRef.current = null;
    setIsConnecting(false);
    setIsConnected(false);
    globalConnectingLocks.delete(url);
  }, [clearReconnect, clearHeartbeat, url]);

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

      const timeout = setTimeout(() => {
        pendingAcksRef.current.delete(messageId);
        resolve(false);
      }, 10000);

      pendingAcksRef.current.set(messageId, { resolve, timeout });
      wsRef.current.send(JSON.stringify(fullMessage));
    });
  }, []);

  const subscribe = useCallback((target: SubscriptionTarget, id?: string) => {
    sendMessage({
      type: 'subscribe',
      payload: { target, id }
    });
  }, [sendMessage]);

  const unsubscribe = useCallback((target: SubscriptionTarget, id?: string) => {
    sendMessage({
      type: 'unsubscribe',
      payload: { target, id }
    });
  }, [sendMessage]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (autoConnect) {
      timeoutId = setTimeout(() => {
        connectRef.current?.();
      }, 0);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      disconnect();
    };
  }, [autoConnect, url, disconnect]);

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
