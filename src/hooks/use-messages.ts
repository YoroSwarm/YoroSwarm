/**
 * Messages Hook
 * 迁移自 React SPA: frontend/src/hooks/useMessages.ts
 * 用于管理消息数据
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { messagesApi, type MessageResponse } from '@/lib/api/messages';
import type { Message, MessageType, MessageStatus } from '@/types/chat';

interface UseMessagesOptions {
  sessionId: string | null;
  autoLoad?: boolean;
}

export function useMessages(options: UseMessagesOptions) {
  const { sessionId, autoLoad = true } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 转换 API 消息到前端类型
  const convertApiMessage = (msg: MessageResponse, sessionId: string): Message => {
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

    return {
      id: msg.id,
      sessionId,
      type: typeMap[msg.type] || 'text',
      content: msg.content,
      sender: {
        id: msg.sender_id,
        type: msg.sender_id === 'user' ? 'user' : 'agent',
        name: msg.sender_id,
      },
      status: statusMap[msg.status] || 'received',
      createdAt: msg.created_at,
      metadata: msg.metadata,
    };
  };

  // 加载消息
  const loadMessages = useCallback(async (isLoadMore = false) => {
    if (!sessionId || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const currentPage = isLoadMore ? page + 1 : 1;
      const response = await messagesApi.getConversationMessages(sessionId, {
        page: currentPage,
        page_size: pageSize,
      });

      const convertedMessages = response.items.map((msg) =>
        convertApiMessage(msg, sessionId)
      );

      if (isLoadMore) {
        setMessages((prev) => [...convertedMessages, ...prev]);
        setPage(currentPage);
      } else {
        setMessages(convertedMessages);
        setPage(1);
      }

      setHasMore(response.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading, page]);

  // 发送消息
  const sendMessage = useCallback(async (content: string, type: MessageType = 'text') => {
    if (!sessionId) return;

    // 乐观更新：先添加到本地
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      sessionId,
      type,
      content,
      sender: {
        id: 'user',
        type: 'user',
        name: '我',
      },
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await messagesApi.sendMessage({
        content,
        type: type === 'text' ? 'text' : 'system',
        conversation_id: sessionId,
      });

      // 替换临时消息为真实消息
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? convertApiMessage(response, sessionId) : msg
        )
      );
    } catch (err) {
      // 标记为失败
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'error' as const } : msg
        )
      );
      setError(err instanceof Error ? err.message : '发送消息失败');
      throw err;
    }
  }, [sessionId]);

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
    markAsRead,
  };
}
