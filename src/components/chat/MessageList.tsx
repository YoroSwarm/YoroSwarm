'use client';

import { useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatMessageGroup } from '@/lib/utils/date';
import { MessageItem } from './MessageItem';
import { ThinkingIndicator } from './ThinkingIndicator';
import { Loader2 } from 'lucide-react';
import type { Message, Agent } from '@/types/chat';
import type { StreamingState, AgentStreamingState } from '@/hooks/use-messages';

interface MessageListProps {
  sessionId: string;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  streamingState?: StreamingState;
  activeStreamingStates?: AgentStreamingState[];
  participants?: Agent[];
  className?: string;
}

export function MessageList({ sessionId, messages, isLoading, hasMore, onLoadMore, streamingState: _streamingState, activeStreamingStates = [], participants = [], className }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const isUserScrolling = useRef(false);

  // Find Lead agent ID from participants or streaming states
  const leadAgentIdFromParticipants = participants.find(p => p.role === 'lead')?.id;
  const leadAgentIdFromStreaming = activeStreamingStates.find(s => s.role === 'lead')?.agentId;
  const leadAgentId = leadAgentIdFromParticipants || leadAgentIdFromStreaming;

  useEffect(() => {
    isFirstLoad.current = true;
    isUserScrolling.current = false;
  }, [sessionId]);

  useEffect(() => {
    // 当有消息加载完成且是首次加载时，滚动到底部
    if (containerRef.current && isFirstLoad.current && messages.length > 0 && !isLoading) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      isFirstLoad.current = false;
    }
  }, [messages, isLoading, messages.length]);

  // 智能自动滚动：只在用户未向上滚动时才自动滚动到底部
  useEffect(() => {
    if (!containerRef.current || !activeStreamingStates.some(s => s.isThinking)) {
      return;
    }

    const container = containerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // 只有在用户已经在底部附近时才自动滚动
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [activeStreamingStates]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    // 检测用户是否主动向上滚动（距离底部超过150px）
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolling.current = distanceFromBottom > 150;

    // 加载更多历史消息
    if (scrollTop === 0 && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  const groupMessages = useCallback(() => {
    const groups: { date: string; messages: typeof messages }[] = [];
    let currentGroup: { date: string; messages: typeof messages } | null = null;

    messages.forEach((message, index) => {
      const messageDate = formatMessageGroup(message.createdAt);
      const prevMessage = messages[index - 1];
      const needsNewGroup =
        !currentGroup ||
        currentGroup.date !== messageDate ||
        (prevMessage &&
          new Date(message.createdAt).getTime() -
            new Date(prevMessage.createdAt).getTime() >
            5 * 60 * 1000);

      if (needsNewGroup) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup?.messages.push(message);
    });

    return groups;
  }, [messages]);

  const messageGroups = groupMessages();

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        'h-full overflow-y-auto scroll-smooth px-4 py-6',
        className
      )}
    >
      {isLoading && hasMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">加载历史消息...</span>
        </div>
      )}

      <div className="space-y-6">
        {messageGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-px flex-1 bg-border" />
              <span className="mx-4 text-xs text-muted-foreground">
                {group.date}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-4">
              {group.messages.map((message, messageIndex) => {
                const prevMessage = group.messages[messageIndex - 1];
                const showAvatar =
                  !prevMessage || prevMessage.sender.id !== message.sender.id;
                
                // 判断是否需要显示时间：5分钟内连续消息不显示时间
                const showTime = !prevMessage || 
                  new Date(message.createdAt).getTime() - 
                  new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000;

                // Determine if sender is Lead
                const isLead = message.sender.type === 'user' ||
                  (message.sender.type === 'agent' &&
                    (message.sender.id === leadAgentId || !leadAgentId));

                return (
                  <MessageItem
                    key={message.id}
                    message={message}
                    showAvatar={showAvatar}
                    isConsecutive={!showAvatar}
                    showTime={showTime}
                    isLead={isLead}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {messages.length === 0 && !isLoading && (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <Image src="/icon.svg" alt="" width={64} height={64} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">还没有消息</p>
          <p className="text-sm mt-1">发送一条消息开始对话</p>
        </div>
      )}

      {/* Thinking Indicators - Simple status only */}
      {activeStreamingStates.length > 0 && (
        <div className="mt-2 space-y-1">
          {activeStreamingStates
            .filter((state) => state.isThinking)
            .map((state) => (
              <ThinkingIndicator
                key={state.agentId}
                agentName={state.agentName}
                agentId={state.agentId}
                role={state.role}
                isThinking={state.isThinking}
                thinkingContent={state.thinkingContent}
              />
            ))}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
