'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { SessionList } from './SessionList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useSessions } from '@/hooks/use-sessions';
import { useMessages } from '@/hooks/use-messages';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAgents } from '@/hooks/use-agents';
import type { ChatMessagePayload, WebSocketMessage } from '@/types/websocket';
import { PanelRightClose, PanelRightOpen, Menu, X } from 'lucide-react';

interface ChatLayoutProps {
  className?: string;
  initialSessionId?: string | null;
}

export function ChatLayout({ className, initialSessionId = null }: ChatLayoutProps) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId);

  const { sessions } = useSessions();
  const { agents } = useAgents();

  const resolvedSessionId = currentSessionId ?? initialSessionId ?? sessions[0]?.id ?? null;

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === resolvedSessionId) || null,
    [resolvedSessionId, sessions]
  );

  const {
    messages,
    isLoading: isMessagesLoading,
    hasMore,
    loadMessages,
    sendMessage,
    appendRealtimeMessage,
  } = useMessages({
    sessionId: resolvedSessionId,
    participants: currentSession?.participants,
    autoLoad: true,
  });

  const wsUrl = useMemo(() => {
    if (!resolvedSessionId || typeof window === 'undefined') return '';

    const baseUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001').replace(/\/$/, '');
    return `${baseUrl}/ws/conversations/${resolvedSessionId}?conversationId=${resolvedSessionId}`;
  }, [resolvedSessionId]);

  useWebSocket({
    url: wsUrl,
    autoConnect: Boolean(wsUrl),
    onMessage: (message: WebSocketMessage) => {
      if (message.type !== 'chat_message') return;
      appendRealtimeMessage(message.payload as ChatMessagePayload);
    },
  });

  const currentSessionTitle = useMemo(() => {
    if (!resolvedSessionId) return null;
    return currentSession?.title || '未命名会话';
  }, [currentSession?.title, resolvedSessionId]);

  return (
    <div className={cn('flex h-screen w-full bg-background', className)}>
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 transform border-r border-border bg-card transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SessionList
          currentSessionId={resolvedSessionId}
          onSessionSelect={(id) => {
            setCurrentSessionId(id);
            setIsMobileMenuOpen(false);
          }}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="-ml-2 rounded-md p-2 hover:bg-accent lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold">
              {currentSessionTitle || '选择或创建一个会话'}
            </h1>
          </div>

          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className="hidden rounded-md p-2 hover:bg-accent md:flex"
            title={isRightPanelOpen ? '关闭右侧面板' : '打开右侧面板'}
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </button>
        </header>

        <div className="flex-1 overflow-hidden">
          {resolvedSessionId ? (
            <MessageList
              sessionId={resolvedSessionId}
              messages={messages}
              isLoading={isMessagesLoading}
              hasMore={hasMore}
              onLoadMore={() => {
                void loadMessages(true);
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <div className="mb-4 text-6xl">💬</div>
              <p className="text-lg">选择一个会话开始聊天</p>
              <p className="mt-2 text-sm">或创建一个新的会话</p>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card/50 p-4 backdrop-blur-sm">
          <ChatInput
            sessionId={resolvedSessionId}
            disabled={!resolvedSessionId}
            placeholder={resolvedSessionId ? '输入消息...' : '请先选择一个会话'}
            onSend={async (content, attachments) => {
              await sendMessage(content, 'text', attachments);
            }}
          />
        </div>
      </main>

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-30 w-80 transform border-l border-border bg-card transition-transform duration-300 ease-in-out md:static',
          isRightPanelOpen ? 'translate-x-0' : 'translate-x-full md:w-0 md:overflow-hidden md:border-l-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
            <h2 className="font-semibold">详情</h2>
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="rounded-md p-2 hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {resolvedSessionId ? (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">会话信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">会话ID</span>
                      <span className="font-mono text-xs">{resolvedSessionId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">状态</span>
                      <span>活跃</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">参与者</h3>
                  <div className="space-y-2">
                    {(currentSession?.participants.length
                      ? currentSession.participants
                      : agents.map((agent) => ({
                          id: agent.id,
                          name: agent.name,
                          role: agent.description || agent.type,
                          status: agent.status,
                        }))).map((participant) => (
                      <div key={participant.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
                          {participant.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{participant.name}</p>
                          <p className="text-xs text-muted-foreground">{participant.role}</p>
                        </div>
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          participant.status === 'offline'
                            ? 'bg-neutral-300'
                            : participant.status === 'busy'
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        )} />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                选择一个会话查看详情
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
