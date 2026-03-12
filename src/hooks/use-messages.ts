/**
 * Messages Hook
 * 迁移自 React SPA: frontend/src/hooks/useMessages.ts
 * 用于管理消息数据
 */

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { messagesApi, type MessageResponse } from '@/lib/api/messages';
import { filesApi } from '@/lib/api/files';
import type { Agent, Message, MessageType, MessageStatus } from '@/types/chat';
import type { ChatMessagePayload } from '@/types/websocket';
import { storage } from '@/utils/storage';
import type { User } from '@/types';

interface UseMessagesOptions {
  sessionId: string | null;
  participants?: Agent[];
  autoLoad?: boolean;
}

type FileMessageMetadata = {
  fileId?: string;
  fileName?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  url?: string;
};

type IncomingRealtimeMessage = ChatMessagePayload & {
  created_at?: string;
};

export function useMessages(options: UseMessagesOptions) {
  const { sessionId, participants = [], autoLoad = true } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const isLoadingRef = useRef(false);
  const optimisticKeyRef = useRef<Map<string, string>>(new Map());
  const pageSize = 20;
  const resolveCurrentUser = useCallback((): Pick<User, 'id' | 'username'> | null => {
    const storedUser = storage.get<User>('user');
    if (storedUser?.id) {
      return {
        id: storedUser.id,
        username: storedUser.username || '我',
      };
    }

    const authState = storage.get<{ state?: { user?: User | null } }>('auth-storage')
      || storage.get<{ state?: { user?: User | null } }>('swarm-auth-storage');
    const hydratedUser = authState?.state?.user;
    if (hydratedUser?.id) {
      return {
        id: hydratedUser.id,
        username: hydratedUser.username || '我',
      };
    }

    const token = storage.get<string>('access_token');
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1] || '')) as { userId?: string; username?: string };
      if (!payload.userId) return null;
      return {
        id: payload.userId,
        username: payload.username || '我',
      };
    } catch {
      return null;
    }
  }, []);

  const currentUser = useMemo(() => resolveCurrentUser(), [resolveCurrentUser]);

  const normalizeAttachment = useCallback((metadata?: Record<string, unknown>) => {
    if (!metadata) return undefined;

    const fileMetadata = metadata as FileMessageMetadata;
    if (!fileMetadata.url) return undefined;

    return [{
      id: fileMetadata.fileId || fileMetadata.url,
      type: fileMetadata.mimeType?.startsWith('image/') ? 'image' as const : 'file' as const,
      url: fileMetadata.url,
      name: fileMetadata.name || fileMetadata.fileName || '文件',
      size: typeof fileMetadata.size === 'number' ? fileMetadata.size : undefined,
      mimeType: fileMetadata.mimeType,
    }];
  }, []);

  const buildOptimisticKey = useCallback((senderId: string, content: string, createdAt?: string) => {
    const normalizedTime = createdAt ? new Date(createdAt).getTime() : 0;
    const bucket = normalizedTime ? Math.floor(normalizedTime / 5000) : 0;
    return `${senderId}:${content}:${bucket}`;
  }, []);

  // 转换 API 消息到前端类型
  const convertApiMessage = useCallback((msg: MessageResponse, sessionId: string): Message => {
    const typeMap: Record<string, MessageType> = {
      text: 'text',
      task_update: 'system',
      agent_status: 'system',
      system: 'system',
      file: 'file',
      broadcast: 'system',
    };

    const statusMap: Record<string, MessageStatus> = {
      sent: 'sent',
      delivered: 'received',
      read: 'received',
      failed: 'error',
    };

    const isSystemMessage = msg.type !== 'text' && msg.type !== 'file';
    const isCurrentUser = currentUser?.id ? msg.sender_id === currentUser.id : false;
    const matchedParticipant = participants.find((participant) => participant.id === msg.sender_id);
    const senderType = isSystemMessage ? 'system' : isCurrentUser ? 'user' : 'agent';
    const fallbackName = isCurrentUser
      ? (currentUser?.username || '我')
      : matchedParticipant?.name || `Agent ${msg.sender_id.slice(0, 6)}`;

    const attachments = msg.type === 'file' ? normalizeAttachment(msg.metadata) : undefined;
    const primaryAttachment = attachments?.[0];
    const resolvedType = msg.type === 'file' && primaryAttachment?.mimeType?.startsWith('image/')
      ? 'image'
      : typeMap[msg.type] || 'text';

    return {
      id: msg.id,
      sessionId,
      type: resolvedType,
      content: primaryAttachment?.url || msg.content,
      sender: {
        id: msg.sender_id,
        type: senderType,
        name: fallbackName,
      },
      status: statusMap[msg.status] || 'received',
      createdAt: msg.created_at,
      attachments,
      metadata: msg.metadata,
    };
  }, [currentUser?.id, currentUser?.username, normalizeAttachment, participants]);

  const convertRealtimeMessage = useCallback((msg: IncomingRealtimeMessage, activeSessionId: string): Message => {
    const apiShape: MessageResponse = {
      id: msg.id,
      content: msg.content,
      type: msg.type,
      sender_id: msg.sender_id,
      conversation_id: msg.conversation_id,
      status: msg.status || 'sent',
      metadata: msg.metadata,
      created_at: msg.created_at || msg.timestamp,
      read_at: msg.read_at,
    };

    return convertApiMessage(apiShape, activeSessionId);
  }, [convertApiMessage]);

  const appendRealtimeMessage = useCallback((incoming: IncomingRealtimeMessage) => {
    if (!sessionId || incoming.conversation_id !== sessionId) return;

    const normalized = convertRealtimeMessage(incoming, sessionId);
    const optimisticKey = buildOptimisticKey(
      normalized.sender.id,
      normalized.attachments?.[0]?.name || normalized.content,
      normalized.createdAt
    );

    setMessages((prev) => {
      if (prev.some((message) => message.id === normalized.id)) {
        return prev;
      }

      const optimisticId = optimisticKeyRef.current.get(optimisticKey);
      if (optimisticId) {
        optimisticKeyRef.current.delete(optimisticKey);
        return prev.map((message) => message.id === optimisticId ? normalized : message);
      }

      return [...prev, normalized];
    });
  }, [buildOptimisticKey, convertRealtimeMessage, sessionId]);

  // 加载消息
  const loadMessages = useCallback(async (isLoadMore = false) => {
    if (!sessionId || isLoadingRef.current) return;

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 1;
      const response = await messagesApi.getConversationMessages(sessionId, {
        page: currentPage,
        page_size: pageSize,
      });

      const convertedMessages = response.items.map((msg) =>
        convertApiMessage(msg, sessionId)
      );

      if (isLoadMore) {
        setMessages((prev) => [...convertedMessages, ...prev]);
        pageRef.current = currentPage;
      } else {
        setMessages(convertedMessages);
        pageRef.current = 1;
        void messagesApi.markConversationAsRead(sessionId).catch(() => undefined);
      }

      setHasMore(response.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [sessionId, convertApiMessage]);

  // 发送消息
  const sendMessage = useCallback(async (content: string, type: MessageType = 'text', attachments?: File[]) => {
    if (!sessionId) return;

    const trimmedContent = content.trim();
    const files = attachments || [];

    if (!trimmedContent && files.length === 0) return;

    try {
      if (trimmedContent) {
        const tempId = `temp-${Date.now()}`;
        const tempMessage: Message = {
          id: tempId,
          sessionId,
          type,
          content: trimmedContent,
          sender: {
            id: currentUser?.id || 'current-user',
            type: 'user',
            name: currentUser?.username || '我',
          },
          status: 'sending',
          createdAt: new Date().toISOString(),
        };

        const optimisticKey = buildOptimisticKey(tempMessage.sender.id, tempMessage.content, tempMessage.createdAt);
        optimisticKeyRef.current.set(optimisticKey, tempId);

        setMessages((prev) => [...prev, tempMessage]);

        const response = await messagesApi.sendMessage({
          content: trimmedContent,
          type: type === 'text' ? 'text' : 'system',
          conversation_id: sessionId,
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? convertApiMessage(response, sessionId) : msg
          )
        );
      }

      for (const file of files) {
        const uploaded = await filesApi.uploadFile(file);
        const tempId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const tempFileMessage: Message = {
          id: tempId,
          sessionId,
          type: uploaded.mimeType.startsWith('image/') ? 'image' : 'file',
          content: uploaded.url,
          sender: {
            id: currentUser?.id || 'current-user',
            type: 'user',
            name: currentUser?.username || '我',
          },
          status: 'sending',
          createdAt: new Date().toISOString(),
          attachments: [{
            id: uploaded.id,
            type: uploaded.mimeType.startsWith('image/') ? 'image' : 'file',
            url: uploaded.url,
            name: uploaded.originalName,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
          }],
          metadata: {
            ...(uploaded.mimeType.startsWith('image/') ? {} : {}),
          },
        };

        const optimisticKey = buildOptimisticKey(
          tempFileMessage.sender.id,
          uploaded.originalName,
          tempFileMessage.createdAt
        );
        optimisticKeyRef.current.set(optimisticKey, tempId);

        setMessages((prev) => [...prev, tempFileMessage]);

        const response = await messagesApi.sendMessage({
          content: uploaded.originalName,
          type: 'file',
          conversation_id: sessionId,
          metadata: {
            fileId: uploaded.id,
            fileName: uploaded.originalName,
            name: uploaded.originalName,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            url: uploaded.url,
          },
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? convertApiMessage(response, sessionId) : msg
          )
        );
      }
    } catch (err) {
      setMessages((prev) => prev.map((msg) => (
        msg.status === 'sending' ? { ...msg, status: 'error' as const } : msg
      )));
      optimisticKeyRef.current.clear();
      setError(err instanceof Error ? err.message : '发送消息失败');
      throw err;
    }
  }, [sessionId, currentUser?.id, currentUser?.username, convertApiMessage, buildOptimisticKey]);

  // 标记已读
  const markAsRead = useCallback(async (messageId: string) => {
    try {
      await messagesApi.markAsRead(messageId);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, status: 'received' as const } : msg
        )
      );
    } catch (err) {
      console.error('标记已读失败:', err);
    }
  }, []);

  // 自动加载
  useEffect(() => {
    setMessages([]);
    pageRef.current = 1;
    setHasMore(true);
    isLoadingRef.current = false;
    optimisticKeyRef.current.clear();

    if (autoLoad && sessionId) {
      loadMessages(false);
    }
  }, [autoLoad, sessionId, loadMessages]);

  return {
    messages,
    isLoading,
    error,
    hasMore,
    loadMessages,
    sendMessage,
    appendRealtimeMessage,
    markAsRead,
  };
}
