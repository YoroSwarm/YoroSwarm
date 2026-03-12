/**
 * Sessions Hook
 * 迁移自 React SPA: frontend/src/hooks/useSessions.ts
 * 用于管理会话数据
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { messagesApi, type ConversationResponse } from '@/lib/api/messages';
import type { Session } from '@/types/chat';

interface UseSessionsOptions {
  autoLoad?: boolean;
}

export function useSessions(options: UseSessionsOptions = {}) {
  const { autoLoad = true } = options;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // 转换 API 响应到前端类型
  const convertConversationToSession = (conv: ConversationResponse): Session => {
    return {
      id: conv.id,
      title: conv.title || '未命名会话',
      description: conv.last_message?.content?.substring(0, 100),
      participants: [], // 需要从其他 API 获取
      lastMessage: conv.last_message ? {
        id: conv.last_message.id,
        sessionId: conv.id,
        type: conv.last_message.type === 'text' ? 'text' : 'system',
        content: conv.last_message.content,
        sender: {
          id: conv.last_message.sender_id,
          type: 'user',
          name: 'User',
        },
        status: 'received',
        createdAt: conv.last_message.created_at,
      } : undefined,
      unreadCount: 0, // 需要从其他 API 获取
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      status: conv.is_active ? 'active' : 'archived',
    };
  };

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await messagesApi.getConversations();
      const convertedSessions = response.items.map(convertConversationToSession);
      setSessions(convertedSessions);
      setTotalCount(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建新会话
  const createSession = useCallback(async (title?: string) => {
    try {
      const response = await messagesApi.createConversation({
        type: 'direct',
        title: title || '新会话',
        participant_ids: [],
      });
      const newSession = convertConversationToSession(response);
      setSessions((prev) => [newSession, ...prev]);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败');
      throw err;
    }
  }, []);

  // 删除会话
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      // API 没有直接删除会话的接口，这里只做本地更新
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除会话失败');
      throw err;
    }
  }, []);

  // 归档会话
  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: 'archived' as const } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '归档会话失败');
      throw err;
    }
  }, []);

  // 自动加载
  useEffect(() => {
    if (autoLoad) {
      loadSessions();
    }
  }, [autoLoad, loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    totalCount,
    loadSessions,
    createSession,
    deleteSession,
    archiveSession,
  };
}
