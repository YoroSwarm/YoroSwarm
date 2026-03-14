'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { swarmSessionsApi, type ExternalMessageResponse, type SendExternalMessageRequest } from '@/lib/api/swarm-sessions';
import { filesApi } from '@/lib/api/files';
import type { Agent, Message, ToolCall } from '@/types/chat';
import type { ChatMessagePayload, AgentThinkingPayload, ToolActivityPayload } from '@/types/websocket';

export interface ToolCallState {
  toolName: string;
  status: 'calling' | 'completed' | 'error';
  inputSummary?: string;
  resultSummary?: string;
  timestamp: string;
}

export interface AgentStreamingState {
  isThinking: boolean;
  agentName: string;
  agentId: string;
  role: 'lead' | 'teammate';
  thinkingContent: string[];
  toolCalls: ToolCallState[];
  lastUpdatedAt: number;
}

// Map of agent_id -> streaming state
export type StreamingStateMap = Map<string, AgentStreamingState>;

// For backward compatibility - returns lead agent's state or empty
export interface StreamingState {
  isThinking: boolean;
  agentName: string;
  agentId: string;
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

  // 从 metadata 中提取附件信息
  const metadataAttachments = (message.metadata as { attachments?: Array<{ fileId: string; fileName: string; mimeType: string }> })?.attachments;
  const attachments = metadataAttachments?.map((att) => ({
    id: att.fileId,
    name: att.fileName,
    type: (att.mimeType?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
    url: `/api/files/${att.fileId}`,
    mimeType: att.mimeType,
  }));

  return {
    id: message.id,
    sessionId: message.swarm_session_id,
    type: message.message_type === 'file' ? 'file' : message.message_type === 'system' ? 'system' : 'text',
    content: message.content,
    sender: {
      id: message.sender_id || (isUser ? 'user' : lead?.id || 'lead'),
      type: isUser ? 'user' : 'agent',
      name: isUser ? '我' : lead?.name || 'Swarm',
    },
    status: 'received',
    createdAt: message.created_at,
    metadata: message.metadata as Message['metadata'],
    toolCalls: (message.metadata as { toolCalls?: ToolCall[] })?.toolCalls,
    thinkingContent: (message.metadata as { thinkingContent?: string[] })?.thinkingContent,
    attachments,
  };
}

export function useMessages(options: UseMessagesOptions) {
  const { sessionId, participants = EMPTY_PARTICIPANTS, autoLoad = true } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const optimisticIds = useRef(new Set<string>());
  const [streamingStateMap, setStreamingStateMap] = useState<StreamingStateMap>(new Map());

  // Get all active streaming states (agents that are thinking or have recent activity)
  // Also include agents that are marked as 'busy' in participants
  const activeStreamingStates = useMemo(() => {
    const now = Date.now();
    const thirtySecondsAgo = now - 30000;

    // Start with states from streamingStateMap
    const states = Array.from(streamingStateMap.values()).filter(
      (state) => state.isThinking || state.toolCalls.some((tool) => tool.status === 'calling') || state.lastUpdatedAt > thirtySecondsAgo
    );

    // Also include busy agents from participants that aren't already in the map
    const busyAgents = participants.filter(
      (p) => p.status === 'busy' && !streamingStateMap.has(p.id)
    );

    busyAgents.forEach((agent) => {
      states.push({
        agentId: agent.id,
        agentName: agent.name,
        role: (agent.role === 'lead' ? 'lead' : 'teammate') as 'lead' | 'teammate',
        isThinking: true, // Busy agents are considered thinking
        thinkingContent: [],
        toolCalls: [],
        lastUpdatedAt: now,
      });
    });

    return states;
  }, [streamingStateMap, participants]);

  // For backward compatibility - returns lead's state or first active state
  const streamingState: StreamingState = useMemo(() => {
    const active = activeStreamingStates[0];
    if (active) {
      return {
        isThinking: active.isThinking,
        agentName: active.agentName,
        agentId: active.agentId,
        thinkingContent: active.thinkingContent,
        toolCalls: active.toolCalls,
      };
    }
    return {
      isThinking: false,
      agentName: '',
      agentId: '',
      thinkingContent: [],
      toolCalls: [],
    };
  }, [activeStreamingStates]);

  const participantMap = useMemo(() => participants, [participants]);

  const loadMessages = useCallback(async (_isLoadMore = false) => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      // Load external messages and agent activities in parallel
      const [messagesResponse, activitiesResponse] = await Promise.all([
        swarmSessionsApi.getExternalMessages(sessionId),
        swarmSessionsApi.getAgentActivities(sessionId),
      ]);

      // Convert external messages
      const externalMessages = messagesResponse.items.map((message) => convertExternalMessage(message, participantMap));

      // Convert agent activities to individual messages (chronological order)
      // Process in order to handle tool_result -> tool_call associations
      const activityMessages: Message[] = [];

      for (const activity of activitiesResponse.items) {
        const isToolCall = activity.activityType === 'tool_call';
        const isToolResult = activity.activityType === 'tool_result';

        if (activity.activityType === 'thinking') {
          activityMessages.push({
            id: activity.id,
            sessionId,
            type: 'text' as const,
            content: activity.content,
            sender: {
              id: activity.agentId,
              type: 'agent' as const,
              name: activity.agentName,
            },
            status: 'received' as const,
            createdAt: activity.createdAt,
            metadata: {
              activityType: 'thinking',
            },
            thinkingContent: [activity.content],
          });
        } else if (isToolCall) {
          activityMessages.push({
            id: activity.id,
            sessionId,
            type: 'text' as const,
            content: `调用工具: ${activity.metadata?.toolName || 'unknown'}`,
            sender: {
              id: activity.agentId,
              type: 'agent' as const,
              name: activity.agentName,
            },
            status: 'received' as const,
            createdAt: activity.createdAt,
            metadata: {
              activityType: 'tool_call',
              toolName: activity.metadata?.toolName || 'unknown',
              toolCallId: activity.metadata?.toolCallId,
            },
            toolCalls: [{
              toolName: activity.metadata?.toolName || 'unknown',
              status: 'calling' as const,
              inputSummary: activity.metadata?.toolInput,
              timestamp: activity.createdAt,
            }],
          });
        } else if (isToolResult) {
          // Find the matching tool_call message by toolCallId, or fallback to agent+name
          const toolCallId = activity.metadata?.toolCallId;
          let matchingToolCallIndex: number;

          if (toolCallId) {
            // Exact match by toolCallId
            matchingToolCallIndex = [...activityMessages].reverse().findIndex(
              (m) => m.metadata?.activityType === 'tool_call' &&
                    m.metadata?.toolCallId === toolCallId
            );
          } else {
            // Fallback: match by agent + toolName + pending status
            matchingToolCallIndex = [...activityMessages].reverse().findIndex(
              (m) => m.metadata?.activityType === 'tool_call' &&
                    m.sender.id === activity.agentId &&
                    m.metadata?.toolName === activity.metadata?.toolName &&
                    m.toolCalls?.[0]?.status === 'calling'
            );
          }

          if (matchingToolCallIndex >= 0) {
            const actualIndex = activityMessages.length - 1 - matchingToolCallIndex;
            const toolCallMsg = activityMessages[actualIndex];
            if (toolCallMsg.toolCalls?.[0]) {
              toolCallMsg.toolCalls[0].status = activity.metadata?.isError ? 'error' : 'completed';
              toolCallMsg.toolCalls[0].resultSummary = activity.content;
              toolCallMsg.metadata = {
                ...toolCallMsg.metadata,
                hasResult: true,
                isError: activity.metadata?.isError,
              };
            }
          }
          // If no matching tool_call found, skip this result (orphaned result)
        }
      }

      // Merge external messages and activity messages, sort by createdAt
      const allMessages = [...externalMessages, ...activityMessages];
      allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      setMessages(allMessages);

      // Clear streaming state since historical activities are now displayed as messages
      setStreamingStateMap(new Map());

      setHasMore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      setIsLoading(false);
    }
  }, [participantMap, sessionId]);

  const streamingStateMapRef = useRef(streamingStateMap);
  useEffect(() => {
    streamingStateMapRef.current = streamingStateMap;
  }, [streamingStateMap]);

  const appendRealtimeMessage = useCallback((incoming: IncomingRealtimeMessage) => {
    if (!sessionId) return;
    const targetSessionId = incoming.swarm_session_id;
    if (targetSessionId !== sessionId) return;

    // 从 metadata 中提取附件信息
    const metadataAttachments = (incoming.metadata as { attachments?: Array<{ fileId: string; fileName: string; mimeType: string }> })?.attachments;
    const attachments = metadataAttachments?.map((att) => ({
      id: att.fileId,
      name: att.fileName,
      type: (att.mimeType?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
      url: `/api/files/${att.fileId}`,
      mimeType: att.mimeType,
    }));

    // Simple conversion - don't merge streaming state data
    // Each activity (thinking, tool_call) is now a separate message
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
          : participantMap.find((participant) => participant.role === 'lead')?.name || incoming.sender_name || 'Swarm',
      },
      status: 'received',
      createdAt: incoming.created_at || incoming.timestamp,
      metadata: incoming.metadata as Message['metadata'],
      attachments,
    };

    setMessages((prev) => {
      if (prev.some((message) => message.id === converted.id)) {
        return prev;
      }

      return [...prev, converted];
    });

    // Clear streaming state for this agent after message is added
    const senderStreamingState = streamingStateMapRef.current.get(incoming.sender_id);
    if (senderStreamingState) {
      setTimeout(() => {
        setStreamingStateMap((prev) => {
          const newMap = new Map(prev);
          const agentState = newMap.get(incoming.sender_id);
          if (agentState) {
            newMap.set(incoming.sender_id, {
              ...agentState,
              isThinking: false,
              thinkingContent: [],
              toolCalls: [],
              lastUpdatedAt: Date.now(),
            });
          }
          return newMap;
        });
      }, 100);
    }
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
      // Upload files first
      const uploadedFiles: Array<{ id: string; originalName: string; mimeType: string; size: number; url: string }> = [];
      for (const file of files) {
        const uploaded = await filesApi.uploadFile(file, activeSessionId);
        uploadedFiles.push({
          id: uploaded.id,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          url: uploaded.url,
        });
      }

      // Send text message (with optional file attachments)
      if (trimmed || uploadedFiles.length > 0) {
        const tempId = `temp-${Date.now()}`;
        optimisticIds.current.add(tempId);
        
        const displayContent = trimmed || uploadedFiles.map(f => f.originalName).join(', ');
        
        setMessages((prev) => [...prev, {
          id: tempId,
          sessionId: activeSessionId,
          type: uploadedFiles.length > 0 && !trimmed ? 'file' : 'text',
          content: displayContent,
          sender: { id: 'user', type: 'user', name: '我' },
          status: 'sending',
          createdAt: new Date().toISOString(),
          attachments: uploadedFiles.map(f => ({
            id: f.id,
            name: f.originalName,
            type: (f.mimeType.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
            size: f.size,
            url: f.url,
          })),
        }]);

        const messagePayload: SendExternalMessageRequest = {
          content: displayContent,
          message_type: trimmed ? 'text' : 'file',
        };

        if (uploadedFiles.length > 0) {
          messagePayload.metadata = {
            ...(trimmed ? {} : {
              fileId: uploadedFiles[0].id,
              fileName: uploadedFiles[0].originalName,
              mimeType: uploadedFiles[0].mimeType,
              size: uploadedFiles[0].size,
              url: uploadedFiles[0].url,
            }),
            attachments: uploadedFiles.map(f => ({
              fileId: f.id,
              fileName: f.originalName,
              mimeType: f.mimeType,
            })),
          };
        }

        const response = await swarmSessionsApi.sendExternalMessage(activeSessionId, messagePayload);
        const serverMessage = convertExternalMessage(response, participantMap);
        
        setMessages((prev) => {
          // 如果 WebSocket 已经推送了这条消息，直接删除临时消息
          if (prev.some((m) => m.id === serverMessage.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          // 否则用服务器消息替换临时消息
          return prev.map((m) => m.id === tempId ? serverMessage : m);
        });
      }

      // 文件消息已作为附件包含在主消息中，无需单独发送
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMessages, participantMap, sessionId]);

  const handleStreamEvent = useCallback((type: string, payload: unknown) => {
    if (type === 'agent_thinking') {
      const data = payload as AgentThinkingPayload;
      const agentId = data.agent_id;

      // Update streaming state for auto-scroll and indicators
      setStreamingStateMap((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(agentId);

        if (data.status === 'start') {
          newMap.set(agentId, {
            agentId,
            agentName: data.agent_name,
            role: existing?.role || 'teammate',
            isThinking: true,
            thinkingContent: [],
            toolCalls: existing?.toolCalls || [],
            lastUpdatedAt: Date.now(),
          });
        } else if (data.status === 'thinking' && data.content) {
          const current = newMap.get(agentId);
          if (current) {
            const lastContent = current.thinkingContent[current.thinkingContent.length - 1];
            if (lastContent !== data.content) {
              newMap.set(agentId, {
                ...current,
                thinkingContent: [...current.thinkingContent, data.content],
                lastUpdatedAt: Date.now(),
              });
            }
          } else {
            newMap.set(agentId, {
              agentId,
              agentName: data.agent_name,
              role: 'teammate',
              isThinking: true,
              thinkingContent: [data.content],
              toolCalls: [],
              lastUpdatedAt: Date.now(),
            });
          }
        } else if (data.status === 'end') {
          const current = newMap.get(agentId);
          if (current) {
            const hasPendingTools = current.toolCalls.some((tool) => tool.status === 'calling');
            if (!hasPendingTools) {
              newMap.delete(agentId);
            } else {
              newMap.set(agentId, {
                ...current,
                isThinking: false,
                lastUpdatedAt: Date.now(),
              });
            }
          }
        }
        return newMap;
      });

      // Also create individual message for chronological display
      if (data.status === 'thinking' && data.content) {
        const thinkingMessage: Message = {
          id: `thinking-${agentId}-${Date.now()}`,
          sessionId: sessionId || '',
          type: 'text',
          content: data.content,
          sender: {
            id: agentId,
            type: 'agent',
            name: data.agent_name,
          },
          status: 'received',
          createdAt: data.timestamp || new Date().toISOString(),
          metadata: {
            activityType: 'thinking',
            seq: data.seq,
          },
          thinkingContent: [data.content],
        };

        setMessages((prev) => {
          // Check for duplicate content
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.metadata?.activityType === 'thinking' &&
              lastMessage.sender.id === agentId &&
              lastMessage.content === data.content) {
            return prev;
          }
          // Add message and sort by timestamp, then by seq
          const newMessages = [...prev, thinkingMessage];
          return newMessages.sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            if (timeA !== timeB) return timeA - timeB;
            // If same timestamp, sort by seq
            const seqA = a.metadata?.seq ?? 0;
            const seqB = b.metadata?.seq ?? 0;
            return seqA - seqB;
          });
        });
      }
    } else if (type === 'tool_activity') {
      const data = payload as ToolActivityPayload;
      const agentId = data.agent_id;

      // Update streaming state for auto-scroll and indicators
      setStreamingStateMap((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(agentId);

        if (data.status === 'calling') {
          const currentToolCalls = existing?.toolCalls || [];
          newMap.set(agentId, {
            agentId,
            agentName: data.agent_name,
            role: existing?.role || 'teammate',
            isThinking: existing?.isThinking ?? true,
            thinkingContent: existing?.thinkingContent || [],
            toolCalls: [
              ...currentToolCalls,
              {
                toolName: data.tool_name,
                status: 'calling',
                inputSummary: data.input_summary,
                timestamp: data.timestamp || new Date().toISOString(),
              },
            ],
            lastUpdatedAt: Date.now(),
          });
        } else {
          const current = newMap.get(agentId);
          if (current) {
            const toolIndex = current.toolCalls.findIndex(
              (tc) => tc.toolName === data.tool_name && tc.status === 'calling'
            );
            if (toolIndex >= 0) {
              const updatedToolCalls = [...current.toolCalls];
              updatedToolCalls[toolIndex] = {
                ...updatedToolCalls[toolIndex],
                status: data.status,
                resultSummary: data.result_summary,
              };
              newMap.set(agentId, {
                ...current,
                toolCalls: updatedToolCalls,
                lastUpdatedAt: Date.now(),
              });
              const updated = newMap.get(agentId);
              if (updated && !updated.isThinking && !updated.toolCalls.some((tool) => tool.status === 'calling')) {
                newMap.delete(agentId);
              }
            }
          }
        }
        return newMap;
      });

      // Create/update individual message for chronological display
      if (data.status === 'calling') {
        const toolMessageId = data.tool_call_id || `tool-call-${agentId}-${data.timestamp || Date.now()}-${data.seq ?? 0}-${data.tool_name}`;
        const toolCallMessage: Message = {
          id: toolMessageId,
          sessionId: sessionId || '',
          type: 'text',
          content: `调用工具: ${data.tool_name}`,
          sender: {
            id: agentId,
            type: 'agent',
            name: data.agent_name,
          },
          status: 'received',
          createdAt: data.timestamp || new Date().toISOString(),
          metadata: {
            activityType: 'tool_call',
            toolName: data.tool_name,
            toolCallId: data.tool_call_id,
            seq: data.seq,
          },
          toolCalls: [{
            toolName: data.tool_name,
            status: 'calling',
            inputSummary: data.input_summary,
            timestamp: data.timestamp || new Date().toISOString(),
          }],
        };

        setMessages((prev) => {
          if (prev.some((message) => message.id === toolMessageId)) {
            return prev;
          }
          const newMessages = [...prev, toolCallMessage];
          return newMessages.sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            if (timeA !== timeB) return timeA - timeB;
            const seqA = a.metadata?.seq ?? 0;
            const seqB = b.metadata?.seq ?? 0;
            return seqA - seqB;
          });
        });
      } else {
        // Update existing tool_call message with result instead of creating new message
        setMessages((prev) => {
          // Find the matching tool_call message by tool_call_id, or fallback to agent+name matching
          let toolCallIndex = [...prev].reverse().findIndex(
            (m) => m.metadata?.activityType === 'tool_call' &&
                  m.metadata?.toolCallId === data.tool_call_id
          );

          // Fallback: if no exact tool_call_id match, find by agent+name+status
          if (toolCallIndex < 0) {
            toolCallIndex = [...prev].reverse().findIndex(
              (m) => m.metadata?.activityType === 'tool_call' &&
                    m.sender.id === agentId &&
                    m.metadata?.toolName === data.tool_name &&
                    m.toolCalls?.[0]?.status === 'calling'
            );
          }

          if (toolCallIndex >= 0) {
            const actualIndex = prev.length - 1 - toolCallIndex;
            const updatedMessages = [...prev];
            const message = updatedMessages[actualIndex];

            updatedMessages[actualIndex] = {
              ...message,
              toolCalls: [{
                ...message.toolCalls![0],
                status: data.status,
                resultSummary: data.result_summary,
              }],
              metadata: {
                ...message.metadata,
                hasResult: true,
                isError: data.status === 'error',
              },
            };
            return updatedMessages;
          }

          // If no matching tool_call found, create a standalone result message (fallback)
          const fallbackResultId = data.tool_call_id
            ? `tool-result-${data.tool_call_id}`
            : `tool-result-${agentId}-${data.timestamp || Date.now()}-${data.seq ?? 0}-${data.tool_name}`;
          const toolResultMessage: Message = {
            id: fallbackResultId,
            sessionId: sessionId || '',
            type: 'text',
            content: data.result_summary || '',
            sender: {
              id: agentId,
              type: 'agent',
              name: data.agent_name,
            },
            status: 'received',
            createdAt: data.timestamp || new Date().toISOString(),
            metadata: {
              activityType: 'tool_result',
              isError: data.status === 'error',
              seq: data.seq,
            },
          };
          if (prev.some((message) => message.id === fallbackResultId)) {
            return prev;
          }
          const newMessages = [...prev, toolResultMessage];
          return newMessages.sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            if (timeA !== timeB) return timeA - timeB;
            const seqA = a.metadata?.seq ?? 0;
            const seqB = b.metadata?.seq ?? 0;
            return seqA - seqB;
          });
        });
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (autoLoad && sessionId) {
      void loadMessages();
    }
  }, [autoLoad, loadMessages, sessionId]);

  // 确保消息列表去重（防止竞态条件导致的重复消息）
  const prevMessagesRef = useRef<Message[]>([]);
  useEffect(() => {
    const seenIds = new Set<string>();
    const duplicates: string[] = [];
    messages.forEach((m) => {
      if (seenIds.has(m.id)) {
        duplicates.push(m.id);
      } else {
        seenIds.add(m.id);
      }
    });
    if (duplicates.length > 0) {
      console.warn('Detected duplicate message IDs:', duplicates);
      const seen = new Set<string>();
      const deduped = messages.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      // 只有当去重后的列表与当前列表不同时才更新
      if (deduped.length !== messages.length) {
        setMessages(deduped);
      }
    }
    prevMessagesRef.current = messages;
  }, [messages]);

  return {
    messages,
    isLoading,
    error,
    hasMore,
    loadMessages,
    sendMessage,
    appendRealtimeMessage,
    streamingState, // Backward compatibility - returns first active state
    streamingStateMap,
    activeStreamingStates, // Array of all active agent states
    handleStreamEvent,
  };
}
