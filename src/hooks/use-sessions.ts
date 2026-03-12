/**
 * Sessions Hook
 * 迁移自 React SPA: frontend/src/hooks/useSessions.ts
 * 用于管理会话数据
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { messagesApi, type ConversationResponse } from '@/lib/api/messages';
import type { Session } from '@/types/chat';
import { storage } from '@/utils/storage';
import type { User } from '@/types';

const AGENT_CHAT_TITLE_PREFIX = '__agent_chat__';

interface UseSessionsOptions {
  autoLoad?: boolean;
}

interface ParsedAgentChat {
  agentId: string;
  agentName: string;
}

function parseAgentChatTitle(title?: string | null): ParsedAgentChat | null {
  if (!title || !title.startsWith(`${AGENT_CHAT_TITLE_PREFIX}:`)) {
    return null;
  }

  const [, agentId, ...encodedNameParts] = title.split(':');
  if (!agentId) return null;

  const encodedName = encodedNameParts.join(':').trim();
  if (!encodedName) {
    return {
      agentId,
      agentName: `Teammate ${agentId.slice(0, 6)}`,
    };
  }

  try {
    const decodedName = decodeURIComponent(encodedName);
    return {
      agentId,
      agentName: decodedName || `Teammate ${agentId.slice(0, 6)}`,
    };
  } catch {
    return {
      agentId,
      agentName: encodedName,
    };
  }
}

export function useSessions(options: UseSessionsOptions = {}) {
  const { autoLoad = true } = options;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

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

  const convertConversationToSession = useCallback((
    conv: ConversationResponse,
    unreadCount: number
  ): Session => {
    const agentChat = parseAgentChatTitle(conv.title);
    const participants = agentChat
      ? [
          ...(currentUser ? [{
            id: currentUser.id,
            name: currentUser.username || '我',
            role: 'owner',
            status: 'online' as const,
          }] : []),
          {
            id: agentChat.agentId,
            name: agentChat.agentName,
            role: 'teammate',
            status: 'online' as const,
          },
        ]
      : conv.participants.map((participant) => ({
          id: participant.user_id,
          name: participant.user_id === currentUser?.id
            ? (currentUser.username || '我')
            : `Participant ${participant.user_id.slice(0, 6)}`,
          role: participant.is_admin ? 'owner' : 'participant',
          status: participant.user_id === currentUser?.id ? 'online' as const : 'busy' as const,
        }));

    const lastMessageType = conv.last_message?.type === 'text'
      ? 'text'
      : conv.last_message?.type === 'file'
        ? 'file'
        : 'system';

    const lastMessageSenderName = conv.last_message
      ? conv.last_message.sender_id === currentUser?.id
        ? (currentUser.username || '我')
        : participants.find((participant) => participant.id === conv.last_message?.sender_id)?.name
          || agentChat?.agentName
          || `Participant ${conv.last_message.sender_id.slice(0, 6)}`
      : undefined;

    return {
      id: conv.id,
      title: agentChat?.agentName || conv.title || '未命名会话',
      description: agentChat
        ? `与 ${agentChat.agentName} 的直接对话`
        : conv.last_message?.content?.substring(0, 100),
      participants,
      lastMessage: conv.last_message ? {
        id: conv.last_message.id,
        sessionId: conv.id,
        type: lastMessageType,
        content: conv.last_message.content,
        sender: {
          id: conv.last_message.sender_id,
          type: conv.last_message.sender_id === currentUser?.id ? 'user' : 'agent',
          name: lastMessageSenderName || '未知发送者',
        },
        status: 'received',
        createdAt: conv.last_message.created_at,
      } : undefined,
      unreadCount,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      status: conv.is_active ? 'active' : 'archived',
    };
  }, [currentUser]);

  const mergeSession = useCallback((incoming: Session) => {
    setSessions((prev) => [incoming, ...prev.filter((session) => session.id !== incoming.id)]);
  }, []);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [response, unreadCounts] = await Promise.all([
        messagesApi.getConversations(),
        messagesApi.getUnreadCount().catch(() => ({ total_unread: 0, conversation_unread: {} as Record<string, number> })),
      ]);
      const convertedSessions = response.items.map((conversation) => (
        convertConversationToSession(
          conversation,
          unreadCounts.conversation_unread[conversation.id] || 0
        )
      ));
      setSessions(convertedSessions);
      setTotalCount(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话失败');
    } finally {
      setIsLoading(false);
    }
  }, [convertConversationToSession]);

  const createSession = useCallback(async (title?: string) => {
    try {
      const response = await messagesApi.createConversation({
        type: 'direct',
        title: title || '新会话',
        participant_ids: [],
      });
      const newSession = convertConversationToSession(response, 0);
      mergeSession(newSession);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败');
      throw err;
    }
  }, [convertConversationToSession, mergeSession]);

  const openDirectSessionForAgent = useCallback(async (agentId: string, agentName?: string) => {
    try {
      const response = await messagesApi.createConversation({
        type: 'direct',
        participant_ids: [],
        target_agent_id: agentId,
        target_agent_name: agentName,
      });
      const directSession = convertConversationToSession(response, 0);
      mergeSession(directSession);
      return directSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开队友会话失败');
      throw err;
    }
  }, [convertConversationToSession, mergeSession]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除会话失败');
      throw err;
    }
  }, []);

  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, status: 'archived' as const } : session
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '归档会话失败');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      void loadSessions();
    }
  }, [autoLoad, loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    totalCount,
    loadSessions,
    createSession,
    openDirectSessionForAgent,
    deleteSession,
    archiveSession,
  };
}
