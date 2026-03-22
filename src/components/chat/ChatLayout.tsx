'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SessionFiles } from '@/components/session/SessionFiles';
import { SessionTasks } from '@/components/session/SessionTasks';
import { SessionSettings } from '@/components/session/SessionSettings';
import { ApprovalCards } from '@/components/tool-approval/ApprovalCards';
import { useToolApprovals } from '@/hooks/use-tool-approvals';
import { useApprovalRules } from '@/hooks/use-approval-rules';
import { useSessions, CURRENT_SESSION_STORAGE_KEY } from '@/hooks/use-sessions';
import { useMessages } from '@/hooks/use-messages';
import { useWebSocket } from '@/hooks/use-websocket';
import { useTeamStats } from '@/hooks/use-team-stats';
import { useSidebar } from '@/stores';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';
import type { ChatMessagePayload, AgentStatusUpdate, ExecutionStatusUpdate, SessionStatusUpdate } from '@/types/websocket';
import { storage } from '@/utils/storage';
import { PanelRightClose, PanelRightOpen, Plus, X, MessageSquare, CheckSquare, FolderOpen, Pause, Play, Settings } from 'lucide-react';

const RIGHT_PANEL_STORAGE_KEY = 'right_panel_open';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ChatLayoutProps {
  className?: string;
  initialSessionId?: string | null;
}

type TabType = 'chat' | 'files' | 'tasks' | 'settings';

function formatTokenCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function ChatLayout({ className, initialSessionId = null }: ChatLayoutProps) {
  const router = useRouter();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() =>
    storage.get(RIGHT_PANEL_STORAGE_KEY, true)
  );
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [fileRefreshTick, setFileRefreshTick] = useState(0);

  const {
    sessions,
    isLoading: _isSessionsLoading,
    error: _sessionsError,
    createSession,
    deleteSession: _deleteSession,
    archiveSession: _archiveSession,
    pauseSession,
    resumeSession,
    setSessions,
    updateSessionParticipant,
  } = useSessions();

  // 保存右侧面板状态到 storage
  useEffect(() => {
    storage.set(RIGHT_PANEL_STORAGE_KEY, isRightPanelOpen);
  }, [isRightPanelOpen]);

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

  // 清理无效的当前会话ID
  useEffect(() => {
    if (currentSessionId) {
      const sessionExists = sessions.some((s) => s.id === currentSessionId);
      if (!sessionExists) {
        setCurrentSessionId(null);
        storage.remove(CURRENT_SESSION_STORAGE_KEY);
      }
    }
  }, [currentSessionId, sessions]);

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

  // Sync URL when auto-selecting a session (no explicit sessionId in URL)
  const initialUrlSynced = useRef(false);
  useEffect(() => {
    if (initialSessionId) {
      initialUrlSynced.current = true;
      return;
    }
    if (!initialUrlSynced.current && resolvedSessionId) {
      initialUrlSynced.current = true;
      router.replace(`/chat?sessionId=${resolvedSessionId}`, { scroll: false });
    }
  }, [initialSessionId, resolvedSessionId, router]);

  // 工具审批 hook - 需要在 resolvedSessionId 之后调用
  const { approvals: toolApprovals, handleDecision: handleToolApprovalDecision, handleWSMessage: handleApprovalWSMessage } = useToolApprovals(resolvedSessionId);
  const { addInlineAutoApprove } = useApprovalRules(resolvedSessionId);

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
    activeStreamingStates,
    handleStreamEvent,
  } = useMessages({
    sessionId: resolvedSessionId,
    participants: currentSession?.participants,
    autoLoad: true,
  });

  const wsUrl = useMemo(() => {
    if (!resolvedSessionId || typeof window === 'undefined') return '';

    // 使用与页面相同的协议/主机/端口
    const baseUrl = (process.env.NEXT_PUBLIC_WS_URL || '').replace(/\/$/, '');
    const wsBase = baseUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    return `${wsBase}/ws/sessions/${resolvedSessionId}?sessionId=${resolvedSessionId}`;
  }, [resolvedSessionId]);

  useWebSocket({
    url: wsUrl,
    autoConnect: Boolean(wsUrl),
    onMessage: (message) => {
      // 处理工具审批相关消息
      if (message.type === 'tool_approval_request' || message.type === 'tool_approval_update') {
        handleApprovalWSMessage(message);
        return;
      }

      if (message.type === 'chat_message') {
        const chatPayload = message.payload as ChatMessagePayload & { sender_type?: string; message_type?: string };
        appendRealtimeMessage(chatPayload as Parameters<typeof appendRealtimeMessage>[0]);
        // Update session list preview with latest message
        const isUserMsg = chatPayload.sender_type === 'user';
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== resolvedSessionId) return s;
            return {
              ...s,
              lastMessage: {
                id: chatPayload.id,
                sessionId: resolvedSessionId,
                type: chatPayload.message_type === 'file' ? 'file' as const : 'text' as const,
                content: chatPayload.content,
                sender: {
                  id: chatPayload.sender_id,
                  type: isUserMsg ? 'user' as const : 'agent' as const,
                  name: isUserMsg ? '我' : chatPayload.sender_name || 'Swarm',
                },
                status: 'received' as const,
                createdAt: chatPayload.created_at || chatPayload.timestamp || new Date().toISOString(),
              },
              updatedAt: chatPayload.created_at || chatPayload.timestamp || new Date().toISOString(),
            };
          })
        );
        return;
      }
      if (message.type === 'agent_thinking' || message.type === 'tool_activity') {
        handleStreamEvent(message.type, message.payload);
        // Infer busy status from thinking/tool activity events
        const payload = message.payload as { agent_id?: string; agent_name?: string; status?: string; swarm_session_id?: string };
        if (payload.agent_id && payload.agent_name) {
          const inferredStatus = (message.type === 'agent_thinking' && payload.status === 'end') ? 'online' : 'busy';
          updateSessionParticipant(resolvedSessionId, {
            id: payload.agent_id,
            name: payload.agent_name,
            status: inferredStatus,
          });
        }
        return;
      }
      // Handle agent status updates to add new teammates to the session
      if (message.type === 'agent_status') {
        const update = message.payload as AgentStatusUpdate;
        const hasRealAgentIdentity = typeof update.agent_id === 'string' && update.agent_id.trim().length > 0
          && typeof update.name === 'string' && update.name.trim().length > 0;

        if (update.swarm_session_id === resolvedSessionId && hasRealAgentIdentity) {
          const normalizedStatus = update.status === 'idle'
            ? 'online'
            : update.status === 'busy' || update.status === 'running' || update.status === 'created' || update.status === 'initializing'
              ? 'busy'
              : update.status === 'error'
                ? 'error'
                : 'offline';

          updateSessionParticipant(resolvedSessionId, {
            id: update.agent_id,
            name: update.name,
            status: normalizedStatus,
          });
        }
        return;
      }
      if (message.type === 'execution_update') {
        const update = message.payload as ExecutionStatusUpdate;
        if (update.swarm_session_id === resolvedSessionId && update.agent_id && update.agent_name) {
          handleStreamEvent(message.type, message.payload);
          const normalizedStatus = update.status === 'interrupted'
            ? 'busy'
            : update.status === 'active'
              ? 'busy'
              : update.status === 'completed'
                ? 'online'
                : update.status === 'cancelled'
                  ? 'online'
                  : 'online';

          updateSessionParticipant(resolvedSessionId, {
            id: update.agent_id,
            name: update.agent_name,
            status: normalizedStatus,
          });
        }
        return;
      }
      if (message.type === 'internal_message') {
        const payload = message.payload as { action?: string; swarm_session_id?: string };
        if (payload.swarm_session_id === resolvedSessionId && payload.action === 'file_created') {
          setFileRefreshTick((value) => value + 1);
        }
      }
      if (message.type === 'session_updated') {
        const payload = message.payload as { swarm_session_id?: string; title?: string };
        if (payload.swarm_session_id === resolvedSessionId && payload.title) {
          setSessions((prev) =>
            prev.map((s) => s.id === resolvedSessionId ? { ...s, title: payload.title! } : s)
          );
        }
      }
      if (message.type === 'session_status') {
        const payload = message.payload as SessionStatusUpdate;
        if (payload.session_id === resolvedSessionId) {
          const newStatus = payload.status === 'paused' ? 'paused' as const : 'active' as const;
          setSessions((prev) =>
            prev.map((s) => s.id === resolvedSessionId ? { ...s, status: newStatus } : s)
          );
        }
      }
    },
  });

  const { stats } = useTeamStats({
    swarmSessionId: resolvedSessionId || undefined,
    autoLoad: Boolean(resolvedSessionId),
  });

  const currentSessionTitle = useMemo(() => {
    if (!resolvedSessionId) return null;
    return currentSession?.title || '未命名会话';
  }, [currentSession?.title, resolvedSessionId]);

  const visibleParticipants = useMemo(() => {
    const participants = currentSession?.participants || [];
    const deduped = new Map<string, typeof participants[number]>();

    for (const participant of participants) {
      if (!participant?.id) continue;
      deduped.set(participant.id, participant);
    }

    return Array.from(deduped.values());
  }, [currentSession?.participants]);

  const leadAgentId = useMemo(() => {
    return stats?.llm_usage.lead_agent_id
      || currentSession?.participants.find((p) => p.role === 'lead')?.id;
  }, [currentSession?.participants, stats?.llm_usage.lead_agent_id]);

  const usageByParticipantId = useMemo(() => {
    const map = new Map<string, {
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens: number;
      cache_read_tokens: number;
      total_tokens: number;
      total_processed_input_tokens: number;
      cache_hit_rate: number;
      last_call_context_tokens: number;
    }>();

    const lead = stats?.llm_usage.lead;
    if (lead && leadAgentId) {
      map.set(leadAgentId, { ...lead, last_call_context_tokens: stats?.llm_usage.lead_last_call_context_tokens || 0 });
    }

    for (const teammate of stats?.llm_usage.teammates || []) {
      map.set(teammate.agent_id, { ...teammate.usage, last_call_context_tokens: teammate.last_call_context_tokens || 0 });
    }

    return map;
  }, [leadAgentId, stats?.llm_usage]);

  const leadTodos = useMemo(() => {
    const todos = stats?.lead_self_todos || [];
    const active = todos.filter((item) => item.status === 'pending' || item.status === 'in_progress');
    const done = todos.filter((item) => item.status !== 'pending' && item.status !== 'in_progress');
    return { active, done };
  }, [stats?.lead_self_todos]);

  const handleCreateSession = async () => {
    try {
      setIsCreatingSession(true);
      setCreateError(null);
      const created = await createSession();
      setCurrentSessionId(created.id);
      router.push(`/chat?sessionId=${created.id}`);
      return created;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建会话失败');
      throw err;
    } finally {
      setIsCreatingSession(false);
    }
  };

  const { sidebarOpen: _sidebarOpen } = useSidebar();
  const { leadNickname, leadAvatarUrl, glassEffect, loadPreferences } = useLeadPreferencesStore();

  // 自动加载 Lead 偏好设置（头像和昵称）
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);
  
  return (
    <div className={cn('chat-glass-root flex h-full w-full bg-background', glassEffect && 'backdrop-blur-sm', className)}>
      <main className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <header className={cn("chat-glass-surface shrink-0 border-b border-border bg-card/50 px-4 shadow-sm", glassEffect ? 'backdrop-blur' : 'backdrop-blur-sm')}>
          {/* First row: title + panel toggle */}
          <div className="flex h-12 items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <h1 className="truncate text-lg font-bold font-heading">
                {currentSessionTitle || '新对话'}
              </h1>
            </div>

            <button
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className="rounded-md p-1.5 hover:bg-accent active:bg-accent/80 border border-transparent hover:border-border transition-all shrink-0"
              title={isRightPanelOpen ? '关闭详情面板' : '打开详情面板'}
            >
              {isRightPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Second row: tab badges + pause/resume */}
          {resolvedSessionId && (
            <div className="flex items-center gap-1.5 pb-2">
              {[
                { id: 'chat', label: '对话', icon: MessageSquare },
                { id: 'files', label: '文件', icon: FolderOpen },
                { id: 'tasks', label: '任务', icon: CheckSquare },
                { id: 'settings', label: '设置', icon: Settings },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border transition-all",
                      isActive
                        ? "bg-accent text-accent-foreground border-border shadow-sm"
                        : "text-muted-foreground border-transparent hover:bg-accent/30 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                );
              })}

              {/* Pause/Resume badge */}
              {currentSession && (
                currentSession.status === 'paused' ? (
                  <button
                    onClick={() => resumeSession(resolvedSessionId)}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-all ml-auto"
                    title="恢复会话"
                  >
                    <Play className="h-3 w-3" />
                    恢复
                  </button>
                ) : currentSession.status === 'active' ? (
                  <button
                    onClick={() => pauseSession(resolvedSessionId)}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition-all ml-auto"
                    title="暂停会话"
                  >
                    <Pause className="h-3 w-3" />
                    暂停
                  </button>
                ) : null
              )}
            </div>
          )}
        </header>

        <div className={cn("chat-glass-panel flex-1 overflow-hidden bg-background relative", glassEffect && 'backdrop-blur-sm')}>
          {resolvedSessionId ? (
            <div className="flex flex-col h-full">
              {/* Main content area */}
              <div className="flex-1 overflow-hidden">
                {/* Chat tab kept mounted (hidden) to avoid expensive re-mount */}
                <div className={cn("h-full", activeTab !== 'chat' && 'hidden')}>
                  <MessageList
                    sessionId={resolvedSessionId}
                    messages={messages}
                    isLoading={isMessagesLoading}
                    hasMore={hasMore}
                    onLoadMore={() => {
                      void loadMessages(true);
                    }}
                    streamingState={streamingState}
                    activeStreamingStates={activeStreamingStates}
                    participants={visibleParticipants}
                  />
                </div>
                <AnimatePresence mode="wait">
                  {activeTab === 'files' && (
                    <motion.div key="files" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15, ease: 'easeInOut' }} className="h-full">
                      <SessionFiles sessionId={resolvedSessionId} refreshToken={fileRefreshTick} />
                    </motion.div>
                  )}
                  {activeTab === 'tasks' && (
                    <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15, ease: 'easeInOut' }} className="h-full">
                      <SessionTasks sessionId={resolvedSessionId} />
                    </motion.div>
                  )}
                  {activeTab === 'settings' && (
                    <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15, ease: 'easeInOut' }} className="h-full">
                      <SessionSettings sessionId={resolvedSessionId} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat input - only on chat tab */}
              {activeTab === 'chat' && (
                <div className={cn("chat-glass-surface border-t border-border bg-card/50 p-2 md:p-4", glassEffect ? 'backdrop-blur' : 'backdrop-blur-sm')}>
                  <ApprovalCards
                    approvals={toolApprovals}
                    onDecision={(id, decision) => handleToolApprovalDecision(id, decision)}
                    onAlwaysAllow={addInlineAutoApprove}
                    className="mb-3"
                  />

                  <ChatInput
                    sessionId={resolvedSessionId}
                    disabled={isCreatingSession || currentSession?.status === 'paused'}
                    placeholder={currentSession?.status === 'paused' ? '会话已暂停，请先恢复后再发送消息' : resolvedSessionId ? '输入消息...' : '直接输入首条消息，系统会自动创建一个 Lead 会话'}
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
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4 md:p-8 text-center">
              <div className="mb-8 relative">
                <Image src="/icon.svg" alt="" width={96} height={96} className="opacity-40" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">开始新旅程</h2>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                记录你的想法，Agent 蜂群将在后台为你整理、执行和创造
              </p>
              <button
                onClick={() => {
                  void handleCreateSession();
                }}
                disabled={isCreatingSession}
                className="mt-8 inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold btn-hand rounded-lg"
              >
                <Plus className="h-4 w-4" />
                {isCreatingSession ? '准备中...' : '新建会话'}
              </button>
              {createError ? <p className="mt-4 text-sm text-destructive font-bold">{createError}</p> : null}
            </div>
          )}
        </div>
      </main>

      {/* Mobile backdrop for right panel */}
      {isRightPanelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setIsRightPanelOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 w-80 border-border bg-card backdrop-blur transition-transform duration-300 ease-in-out shadow-lg',
          'md:chat-glass-surface md:static md:inset-auto md:z-auto md:transition-all md:shadow-none',
          isRightPanelOpen ? 'translate-x-0 md:w-80 border-l' : 'translate-x-full md:translate-x-0 md:w-0 md:border-l-0 md:overflow-hidden md:opacity-0'
        )}
      >
        <div className={cn(
          'flex h-full flex-col min-w-80 transition-opacity duration-200',
          isRightPanelOpen ? 'opacity-100' : 'opacity-0'
        )}>
          <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
            <h2 className="font-semibold">详情</h2>
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="rounded-md p-2 hover:bg-accent active:bg-accent/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {resolvedSessionId ? (
              <div className="space-y-5">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">会话信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">会话ID</span>
                      <span className="font-mono text-xs">{resolvedSessionId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">状态</span>
                      <span>{currentSession?.status === 'paused' ? '已暂停' : currentSession?.status === 'archived' ? '已归档' : '活跃'}</span>
                    </div>
                    {stats?.llm_usage.session ? (
                      <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2.5 mt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Token 总量</span>
                          <span className="font-semibold">{formatTokenCount(stats.llm_usage.session.total_tokens)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <div>输入 {formatTokenCount(stats.llm_usage.session.input_tokens)}</div>
                          <div>输出 {formatTokenCount(stats.llm_usage.session.output_tokens)}</div>
                          <div>缓存读取 {formatTokenCount(stats.llm_usage.session.cache_read_tokens)}</div>
                          <div>缓存率 {formatPercent(stats.llm_usage.session.cache_hit_rate)}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">会话团队</h3>
                  <div className="space-y-1.5">
                    {visibleParticipants.map((participant) => {
                      const isLeadParticipant = participant.id === leadAgentId;
                      const participantName = (isLeadParticipant && leadNickname)
                        ? leadNickname
                        : typeof participant.name === 'string' && participant.name.trim().length > 0
                          ? participant.name.trim()
                          : typeof participant.role === 'string' && participant.role.trim().length > 0
                            ? participant.role.trim()
                            : 'Unknown';
                      const participantAvatar = (isLeadParticipant && leadAvatarUrl) ? leadAvatarUrl : null;
                      const participantInitial = participantName.charAt(0).toUpperCase();
                      const participantRole = typeof participant.role === 'string' && participant.role.trim().length > 0
                        ? participant.role.trim()
                        : 'unknown';
                      const participantStatus = participant.status || 'offline';

                      const usage = usageByParticipantId.get(participant.id);
                      const modelContextSize = stats?.model_context_size || 0;
                      const lastCallTokens = usage?.last_call_context_tokens || 0;
                      const contextUsageRatio = lastCallTokens > 0 && modelContextSize > 0
                        ? Math.min(lastCallTokens / modelContextSize, 1)
                        : 0;

                      return (
                        <Popover key={participant.id}>
                          <PopoverTrigger asChild>
                            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/50 active:bg-accent/70 border border-transparent hover:border-border/20 cursor-default" style={{ borderRadius: "10px 15px 10px 15px / 15px 10px 15px 10px" }}>
                              <div className="flex h-6 w-6 items-center justify-center bg-primary/10 text-xs font-bold border border-border/20 rounded-full overflow-hidden" style={!participantAvatar ? { borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%" } : undefined}>
                                {participantAvatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={participantAvatar} alt={participantName} className="h-full w-full object-cover" />
                                ) : (
                                  participantInitial
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold">{participantName}</p>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-500',
                                        contextUsageRatio >= 0.8
                                          ? 'bg-red-500'
                                          : contextUsageRatio >= 0.5
                                            ? 'bg-amber-500'
                                            : 'bg-blue-500'
                                      )}
                                      style={{ width: `${Math.max(contextUsageRatio * 100, contextUsageRatio > 0 ? 2 : 0)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                                    {lastCallTokens > 0 ? formatTokenCount(lastCallTokens) : '—'}
                                  </span>
                                </div>
                              </div>
                              <div className={cn(
                                'h-2.5 w-2.5 border border-border',
                                participantStatus === 'offline'
                                  ? 'bg-neutral-300'
                                  : participantStatus === 'busy'
                                    ? 'bg-amber-500'
                                    : 'bg-green-500'
                              )} style={{ borderRadius: "50% 50% 50% 50% / 60% 40% 60% 40%" }} />
                            </div>
                          </PopoverTrigger>
                          <PopoverContent align="start" side="bottom" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)]">
                            <div className="space-y-3">
                              <div>
                                <div className="text-sm font-semibold">{participantName}</div>
                                <div className="text-xs text-muted-foreground">{participantRole}</div>
                              </div>
                              {usage ? (
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs text-muted-foreground">上下文用量</span>
                                      <span className="text-xs font-medium tabular-nums">{formatTokenCount(lastCallTokens)} / {modelContextSize > 0 ? formatTokenCount(modelContextSize) : '—'}</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                                      <div
                                        className={cn(
                                          'h-full rounded-full transition-all duration-500',
                                          contextUsageRatio >= 0.8
                                            ? 'bg-red-500'
                                            : contextUsageRatio >= 0.5
                                              ? 'bg-amber-500'
                                              : 'bg-blue-500'
                                        )}
                                        style={{ width: `${Math.max(contextUsageRatio * 100, contextUsageRatio > 0 ? 2 : 0)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">总 Token</span>
                                    <span className="font-semibold">{formatTokenCount(usage.total_tokens)}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    <div>输入 {formatTokenCount(usage.input_tokens)}</div>
                                    <div>输出 {formatTokenCount(usage.output_tokens)}</div>
                                    <div>缓存创建 {formatTokenCount(usage.cache_creation_tokens)}</div>
                                    <div>缓存读取 {formatTokenCount(usage.cache_read_tokens)}</div>
                                  </div>
                                  <div className="text-xs text-muted-foreground">缓存命中率 {formatPercent(usage.cache_hit_rate)}</div>
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">暂无该成员的 token 统计</div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">待办清单</h3>
                  <div className="space-y-1.5">
                    {leadTodos.active.length === 0 && leadTodos.done.length === 0 ? (
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        当前没有待办事项。
                      </div>
                    ) : (
                      <>
                        {leadTodos.active.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                            <span
                              className={cn(
                                'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                                item.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-500'
                              )}
                            />
                            <span className="truncate font-medium">{item.title}</span>
                          </div>
                        ))}

                        {leadTodos.done.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
                            <span className="truncate">{item.title}</span>
                          </div>
                        ))}
                      </>
                    )}
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
