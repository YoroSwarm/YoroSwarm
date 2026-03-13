'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { SessionList } from './SessionList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SessionFiles } from '@/components/session/SessionFiles';
import { SessionTasks } from '@/components/session/SessionTasks';
import { SessionArtifacts } from '@/components/session/SessionArtifacts';
import { useSessions, CURRENT_SESSION_STORAGE_KEY } from '@/hooks/use-sessions';
import { useMessages } from '@/hooks/use-messages';
import { useWebSocket } from '@/hooks/use-websocket';
import { useSidebar } from '@/stores';
import type { ChatMessagePayload } from '@/types/websocket';
import { storage } from '@/utils/storage';
import { PanelRightClose, PanelRightOpen, Menu, Plus, X, MessageSquare, CheckSquare, Layers, FolderOpen } from 'lucide-react';

interface ChatLayoutProps {
  className?: string;
  initialSessionId?: string | null;
}

type TabType = 'chat' | 'files' | 'tasks' | 'artifacts';

export function ChatLayout({ className, initialSessionId = null }: ChatLayoutProps) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId);
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const {
    sessions,
    isLoading: isSessionsLoading,
    error: sessionsError,
    createSession,
    deleteSession,
    archiveSession,
  } = useSessions();

  useEffect(() => {
    if (initialSessionId) {
      setCurrentSessionId(initialSessionId);
      storage.set(CURRENT_SESSION_STORAGE_KEY, initialSessionId);
      return;
    }

    const storedSessionId = storage.get<string>(CURRENT_SESSION_STORAGE_KEY);
    if (storedSessionId) {
      setCurrentSessionId((prev) => prev ?? storedSessionId);
    }
  }, [initialSessionId]);

  const resolvedSessionId = currentSessionId ?? initialSessionId ?? sessions[0]?.id ?? null;

  useEffect(() => {
    if (resolvedSessionId) {
      storage.set(CURRENT_SESSION_STORAGE_KEY, resolvedSessionId);
      return;
    }

    if (sessions.length === 0) {
      storage.remove(CURRENT_SESSION_STORAGE_KEY);
      return;
    }

    const nextSessionId = sessions[0].id;
    setCurrentSessionId(nextSessionId);
    storage.set(CURRENT_SESSION_STORAGE_KEY, nextSessionId);
  }, [resolvedSessionId, sessions]);

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
    streamingState,
    handleStreamEvent,
  } = useMessages({
    sessionId: resolvedSessionId,
    participants: currentSession?.participants,
    autoLoad: true,
  });

  const wsUrl = useMemo(() => {
    if (!resolvedSessionId || typeof window === 'undefined') return '';

    const baseUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001').replace(/\/$/, '');
    return `${baseUrl}/ws/sessions/${resolvedSessionId}?sessionId=${resolvedSessionId}`;
  }, [resolvedSessionId]);

  useWebSocket({
    url: wsUrl,
    autoConnect: Boolean(wsUrl),
    onMessage: (message) => {
      if (message.type === 'chat_message') {
        appendRealtimeMessage(message.payload as ChatMessagePayload);
        return;
      }
      if (message.type === 'agent_thinking' || message.type === 'tool_activity') {
        handleStreamEvent(message.type, message.payload);
      }
    },
  });

  const currentSessionTitle = useMemo(() => {
    if (!resolvedSessionId) return null;
    return currentSession?.title || '未命名会话';
  }, [currentSession?.title, resolvedSessionId]);

  const handleCreateSession = async () => {
    try {
      setIsCreatingSession(true);
      setCreateError(null);
      const created = await createSession();
      setCurrentSessionId(created.id);
      return created;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建会话失败');
      throw err;
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    storage.set(CURRENT_SESSION_STORAGE_KEY, id);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);

    if (resolvedSessionId !== sessionId) return;

    const remaining = sessions.filter((session) => session.id !== sessionId);
    const nextSessionId = remaining[0]?.id ?? null;
    setCurrentSessionId(nextSessionId);
    if (nextSessionId) {
      storage.set(CURRENT_SESSION_STORAGE_KEY, nextSessionId);
    } else {
      storage.remove(CURRENT_SESSION_STORAGE_KEY);
    }
  };

  const { sidebarOpen, toggleSidebar } = useSidebar();
  
  return (
    <div className={cn('flex h-full w-full bg-background', className)}>
      <main className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={toggleSidebar}
              className="lg:hidden -ml-2 rounded-md p-2 hover:bg-accent"
            >
               <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-bold font-heading">
              {currentSessionTitle || '新对话'}
            </h1>
            
            {/* Hand-Drawn Tabs */}
            {resolvedSessionId && (
              <div className="hidden md:flex items-center gap-2 ml-4">
                {[
                  { id: 'chat', label: '对话', icon: MessageSquare },
                  { id: 'files', label: '文件', icon: FolderOpen },
                  { id: 'tasks', label: '任务', icon: CheckSquare },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold transition-all border-2",
                        isActive 
                          ? "bg-accent text-accent-foreground border-border -rotate-1 shadow-hard-sm" 
                          : "bg-transparent text-muted-foreground border-transparent hover:bg-accent/20 hover:text-foreground hover:border-border/50"
                      )}
                      style={{
                        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className="hidden rounded-md p-2 hover:bg-accent md:flex border-2 border-transparent hover:border-border hover:shadow-hard-sm transition-all"
              style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
              title={isRightPanelOpen ? '关闭右侧面板' : '打开右侧面板'}
            >
              {isRightPanelOpen ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRightOpen className="h-5 w-5" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Tabs (Visible only on small screens) */}
        {resolvedSessionId && (
          <div className="flex md:hidden items-center justify-around border-b border-border bg-card p-2 overflow-x-auto">
             {[
                { id: 'chat', label: '对话', icon: MessageSquare },
                { id: 'files', label: '文件', icon: FolderOpen },
                { id: 'tasks', label: '任务', icon: CheckSquare },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 text-xs font-bold border-2 transition-all",
                      isActive 
                        ? "bg-accent/20 text-accent-foreground border-border shadow-hard-sm" 
                        : "text-muted-foreground border-transparent"
                    )}
                    style={{ borderRadius: "15px 225px 15px 255px / 255px 15px 225px 15px" }}
                  >
                    <Icon className="h-5 w-5" />
                    {tab.label}
                  </button>
                );
              })}
          </div>
        )}

        <div className="flex-1 overflow-hidden bg-background relative">
          {resolvedSessionId ? (
            <>
              {activeTab === 'chat' && (
                <div className="flex flex-col h-full">
                    <div className="flex-1 overflow-hidden">
                        <MessageList
                        sessionId={resolvedSessionId}
                        messages={messages}
                        isLoading={isMessagesLoading}
                        hasMore={hasMore}
                        onLoadMore={() => {
                            void loadMessages(true);
                        }}
                        streamingState={streamingState}
                        />
                    </div>
                    <div className="border-t-2 border-dashed border-border bg-card/50 p-4 backdrop-blur-sm">
                        <ChatInput
                            sessionId={resolvedSessionId}
                            disabled={isCreatingSession}
                            placeholder={resolvedSessionId ? '输入消息...' : '直接输入首条消息，系统会自动创建一个 Lead 会话'}
                            onSend={async (content, attachments) => {
                            let targetSessionId = resolvedSessionId;

                            if (!targetSessionId) {
                                const created = await handleCreateSession();
                                targetSessionId = created.id;
                            }

                            await sendMessage(content, 'text', attachments, targetSessionId);
                            }}
                        />
                    </div>
                </div>
              )}
              {activeTab === 'files' && <SessionFiles sessionId={resolvedSessionId} />}
              {activeTab === 'tasks' && <SessionTasks sessionId={resolvedSessionId} />}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <div className="mb-6 rounded-full bg-secondary p-8 border-4 border-dashed border-border animate-jiggle">
                <Plus className="h-12 w-12 text-primary" />
              </div>
              <h2 className="text-3xl font-bold font-heading mb-2 text-foreground">开始新旅程</h2>
              <p className="text-lg max-w-md font-body">
                像在笔记本上涂鸦一样，记录你的想法。Agent 蜂群将在后台为你整理、执行和创造。
              </p>
              <button
                onClick={() => {
                  void handleCreateSession();
                }}
                disabled={isCreatingSession}
                className="mt-8 inline-flex items-center gap-2 px-8 py-3 text-lg font-bold btn-hand"
              >
                <Plus className="h-5 w-5" />
                {isCreatingSession ? '准备画纸...' : '新建会话'}
              </button>
              {createError ? <p className="mt-4 text-sm text-destructive font-bold">{createError}</p> : null}
            </div>
          )}
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
                      <span>{currentSession?.status === 'archived' ? '已归档' : '活跃'}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">会话团队</h3>
                  <div className="space-y-2">
                    {(currentSession?.participants || []).map((participant) => (
                      <div key={participant.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50 border border-transparent hover:border-border/20" style={{ borderRadius: "10px 15px 10px 15px / 15px 10px 15px 10px" }}>
                        <div className="flex h-8 w-8 items-center justify-center bg-primary/10 text-sm font-bold border border-border/20" style={{ borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%" }}>
                          {participant.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{participant.name}</p>
                          <p className="text-xs text-muted-foreground">{participant.role}</p>
                        </div>
                        <div className={cn(
                          'h-2.5 w-2.5 border border-border',
                          participant.status === 'offline'
                            ? 'bg-neutral-300'
                            : participant.status === 'busy'
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        )} style={{ borderRadius: "50% 50% 50% 50% / 60% 40% 60% 40%" }} />
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
