'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { swarmSessionsApi, type ExternalMessageResponse } from '@/lib/api/swarm-sessions';
import { filesApi } from '@/lib/api/files';
import type { Agent, Message } from '@/types/chat';
import type { ChatMessagePayload, AgentThinkingPayload, ToolActivityPayload } from '@/types/websocket';

export interface ToolCallState {
  toolName: string;
  status: 'calling' | 'completed' | 'error';
  inputSummary?: string;
  resultSummary?: string;
  timestamp: string;
}

export interface StreamingState {
  isThinking: boolean;
  agentName: string;
  thinkingContent: string[];
  toolCalls: ToolCallState[];
}

interface UseMessagesOptions {
  sessionId: string | null;
  participants?: Agent[];
  autoLoad?: boolean;
}

type IncomingRealtimeMessage = ChatMessagePayload & {
  swarm_session_id?: string;
  sender_type?: 'user' | 'lead';
  message_type?: string;
};

const EMPTY_PARTICIPANTS: Agent[] = [];

function convertExternalMessage(message: ExternalMessageResponse, participants: Agent[]): Message {
  const lead = participants.find((participant) => participant.role === 'lead');
  const isUser = message.sender_type === 'user';

  return {
    id: message.id,
    sessionId: message.swarm_session_id,
    type: message.message_type === 'file' ? 'file' : message.message_type === 'system' ? 'system' : 'text',
    content: message.content,
    sender: {
      id: message.sender_id || (isUser ? 'user' : lead?.id || 'lead'),
      type: isUser ? 'user' : 'agent',
      name: isUser ? '我' : lead?.name || 'Lead',
    },
    status: 'received',
    createdAt: message.created_at,
    metadata: message.metadata as Message['metadata'],
  };
}

export function useMessages(options: UseMessagesOptions) {
  const { sessionId, participants = EMPTY_PARTICIPANTS, autoLoad = true } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const optimisticIds = useRef(new Set<string>());
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isThinking: false,
    agentName: '',
    thinkingContent: [],
    toolCalls: [],
  });

  const participantMap = useMemo(() => participants, [participants]);

  const loadMessages = useCallback(async (_isLoadMore = false) => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await swarmSessionsApi.getExternalMessages(sessionId);
      setMessages(response.items.map((message) => convertExternalMessage(message, participantMap)));
      setHasMore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      setIsLoading(false);
    }
  }, [participantMap, sessionId]);

  const appendRealtimeMessage = useCallback((incoming: IncomingRealtimeMessage) => {
    if (!sessionId) return;
    const targetSessionId = incoming.swarm_session_id;
    if (targetSessionId !== sessionId) return;

    const converted: Message = {
      id: incoming.id,
      sessionId,
      type: incoming.message_type === 'file' || incoming.type === 'file' ? 'file' : incoming.message_type === 'system' ? 'system' : 'text',
      content: incoming.content,
      sender: {
        id: incoming.sender_id,
        type: incoming.sender_type === 'user' ? 'user' : 'agent',
        name: incoming.sender_type === 'user'
          ? '我'
          : participantMap.find((participant) => participant.role === 'lead')?.name || incoming.sender_name || 'Lead',
      },
      status: 'received',
      createdAt: incoming.created_at || incoming.timestamp,
      metadata: incoming.metadata as Message['metadata'],
    };

    setMessages((prev) => {
      if (prev.some((message) => message.id === converted.id)) {
        return prev;
      }

      return [...prev, converted];
    });
  }, [participantMap, sessionId]);

  const sendMessage = useCallback(async (
    content: string,
    _type: 'text' | 'system' | 'file' = 'text',
    attachments?: File[],
    targetSessionId?: string | null
  ) => {
    const activeSessionId = targetSessionId || sessionId;
    if (!activeSessionId) return;
    const trimmed = content.trim();
    const files = attachments || [];
    if (!trimmed && files.length === 0) return;

    try {
      if (trimmed) {
        const tempId = `temp-${Date.now()}`;
        optimisticIds.current.add(tempId);
        setMessages((prev) => [...prev, {
          id: tempId,
          sessionId: activeSessionId,
          type: 'text',
          content: trimmed,
          sender: { id: 'user', type: 'user', name: '我' },
          status: 'sending',
          createdAt: new Date().toISOString(),
        }]);

        const response = await swarmSessionsApi.sendExternalMessage(activeSessionId, {
          content: trimmed,
          message_type: 'text',
        });

        setMessages((prev) => prev.map((message) => message.id === tempId ? convertExternalMessage(response, participantMap) : message));
      }

      for (const file of files) {
        const uploaded = await filesApi.uploadFile(file, activeSessionId);
        await swarmSessionsApi.sendExternalMessage(activeSessionId, {
          content: uploaded.originalName,
          message_type: 'file',
          metadata: {
            fileId: uploaded.id,
            fileName: uploaded.originalName,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            url: uploaded.url,
          },
        });
      }

      if (files.length > 0) {
        await loadMessages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
      throw err;
    }
  }, [loadMessages, participantMap, sessionId]);

  const handleStreamEvent = useCallback((type: string, payload: unknown) => {
    if (type === 'agent_thinking') {
      const data = payload as AgentThinkingPayload;
      if (data.status === 'start') {
        setStreamingState({
          isThinking: true,
          agentName: data.agent_name,
          thinkingContent: [],
          toolCalls: [],
        });
      } else if (data.status === 'thinking' && data.content) {
        setStreamingState((prev) => ({
          ...prev,
          thinkingContent: [...prev.thinkingContent, data.content!],
        }));
      } else if (data.status === 'end') {
        setStreamingState((prev) => ({
          ...prev,
          isThinking: false,
        }));
      }
    } else if (type === 'tool_activity') {
      const data = payload as ToolActivityPayload;
      setStreamingState((prev) => {
        const existingIndex = prev.toolCalls.findIndex(
          (tc) => tc.toolName === data.tool_name && tc.status === 'calling'
        );
        if (data.status === 'calling') {
          return {
            ...prev,
            toolCalls: [
              ...prev.toolCalls,
              {
                toolName: data.tool_name,
                status: 'calling',
                inputSummary: data.input_summary,
                timestamp: data.timestamp,
              },
            ],
          };
        } else if (existingIndex >= 0) {
          const updated = [...prev.toolCalls];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: data.status,
            resultSummary: data.result_summary,
          };
          return { ...prev, toolCalls: updated };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    if (autoLoad && sessionId) {
      void loadMessages();
    }
  }, [autoLoad, loadMessages, sessionId]);

  return {
    messages,
    isLoading,
    error,
    hasMore,
    loadMessages,
    sendMessage,
    appendRealtimeMessage,
    streamingState,
    handleStreamEvent,
  };
}
