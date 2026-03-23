'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MoreVertical,
  Trash2,
  Archive,
  PanelLeftClose,
  Pause,
  Play,
  AlertCircle,
  Pin,
  PinOff,
  Share2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { appConfig } from '@/lib/config/app';
import { useUIStore, useLlmConfigsStore, useSessionsStore } from '@/stores';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';
import { useSessions } from '@/hooks/use-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { storage } from '@/utils/storage';
import { swarmSessionsApi } from '@/lib/api/swarm-sessions';
import { ShareDialog } from '@/components/session/ShareDialog';

const SHOW_ARCHIVED_STORAGE_KEY = 'show_archived';

export function Sidebar() {
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const { glassEffect } = useLeadPreferencesStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get('sessionId');
  const [showArchivedUserPreference, setShowArchivedUserPreference] = useState(() =>
    storage.get(SHOW_ARCHIVED_STORAGE_KEY, false)
  );
  const [isCreating, setIsCreating] = useState(false);

  // 会话初始化轮询状态
  const initializingSessionsRef = useRef<Set<string>>(new Set());

  // 确认对话框
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // LLM API 配置检查
  const { hasConfig, loadHasConfig } = useLlmConfigsStore();

  // 加载配置状态
  useEffect(() => {
    loadHasConfig();
  }, [loadHasConfig]);

  // 保存归档状态到 storage
  useEffect(() => {
    storage.set(SHOW_ARCHIVED_STORAGE_KEY, showArchivedUserPreference);
  }, [showArchivedUserPreference]);

  const {
    sessions,
    isLoading,
    createSession,
    deleteSession,
    archiveSession,
    unarchiveSession,
    pauseSession,
    resumeSession,
    pinSession,
    unpinSession,
  } = useSessions();

  // 处理开关切换
  const handleToggleArchived = (checked: boolean) => {
    setShowArchivedUserPreference(checked);
  };

  // 分离已归档和未归档会话
  const { activeSessions, archivedSessions } = useMemo(() => {
    const active: typeof sessions = [];
    const archived: typeof sessions = [];
    for (const session of sessions) {
      if (session.status === 'archived') {
        archived.push(session);
      } else {
        active.push(session);
      }
    }
    return { activeSessions: active, archivedSessions: archived };
  }, [sessions]);

  // 显示归档会话列表
  const showArchived = showArchivedUserPreference;

  // 根据开关状态决定显示的会话
  const displayedSessions = showArchived ? archivedSessions : activeSessions;

  // 轮询会话初始化状态
  const pollSessionInit = useCallback(async (sessionId: string) => {
    if (initializingSessionsRef.current.has(sessionId)) return;
    initializingSessionsRef.current.add(sessionId);

    const checkStatus = async () => {
      if (!initializingSessionsRef.current.has(sessionId)) return;

      try {
        const status = await swarmSessionsApi.getSessionStatus(sessionId);
        if (status.venvReady && status.workspaceReady) {
          // 初始化完成，移除标记并清除状态
          initializingSessionsRef.current.delete(sessionId);
          useSessionsStore.getState().setSessionInitializing(sessionId, false);
          return;
        }
      } catch {
        // 忽略错误，继续轮询
      }

      // 继续轮询
      if (initializingSessionsRef.current.has(sessionId)) {
        setTimeout(checkStatus, 1000);
      }
    };

    await checkStatus();
  }, []);

  const handleCreateSession = async () => {
    // 检查是否有 LLM API 配置
    if (!hasConfig) {
      const confirmed = await confirm({
        title: '需要配置 LLM API',
        description: '您需要先配置 LLM API 才能创建会话。是否前往设置？',
        confirmLabel: '前往设置',
        cancelLabel: '取消',
      });
      if (confirmed) {
        router.push('/settings?tab=llm-api');
      }
      return;
    }

    setIsCreating(true);
    try {
      const created = await createSession();
      // 设置初始化状态并开始轮询
      useSessionsStore.getState().setSessionInitializing(created.id, true);
      pollSessionInit(created.id);
      router.push(`/chat?sessionId=${created.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      // 如果是 403 错误，提示用户配置 API
      if (err && typeof err === 'object' && 'code' in err && err.code === 'FORBIDDEN') {
        const confirmed = await confirm({
          title: '需要配置 LLM API',
          description: '请先配置 LLM API。是否前往设置？',
          confirmLabel: '前往设置',
          cancelLabel: '取消',
        });
        if (confirmed) {
          router.push('/settings?tab=llm-api');
        }
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchiveSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await archiveSession(sessionId);
  };

  const handleUnarchiveSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await unarchiveSession(sessionId);
  };

  const handlePauseSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await pauseSession(sessionId);
  };

  const handleResumeSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await resumeSession(sessionId);
  };

  const handlePinSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await pinSession(sessionId);
  };

  const handleUnpinSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await unpinSession(sessionId);
  };

  // Share dialog state
  const [shareDialogSessionId, setShareDialogSessionId] = useState<string | null>(null);

  const handleShareClick = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setShareDialogSessionId(sessionId);
  }, []);

  // Delete confirmation with share check
  const [deleteConfirm, setDeleteConfirm] = useState<{
    sessionId: string;
    sessionTitle: string;
    shareCount: number;
    checking: boolean;
  } | null>(null);

  const handleDeleteClick = useCallback(async (e: React.MouseEvent, session: { id: string; title?: string }) => {
    e.stopPropagation();
    const title = session.title || '未命名会话';
    setDeleteConfirm({ sessionId: session.id, sessionTitle: title, shareCount: 0, checking: true });
    try {
      const res = await swarmSessionsApi.listShares(session.id);
      setDeleteConfirm(prev => prev ? { ...prev, shareCount: res.items.length, checking: false } : null);
    } catch {
      setDeleteConfirm(prev => prev ? { ...prev, checking: false } : null);
    }
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    await deleteSession(deleteConfirm.sessionId);
    if (currentSessionId === deleteConfirm.sessionId) {
      router.push('/chat');
    }
    setDeleteConfirm(null);
  };

  return (
    <>
      <ConfirmDialogComponent />
      <aside
        className={cn(
          'h-screen bg-card border-r border-border flex flex-col transition-all duration-300 relative z-20 shrink-0',
          'w-64 transition-colors duration-200',
          glassEffect && 'backdrop-blur'
        )}
      >
      {/* 1. Logo (Return to Dashboard) + Close Button */}
      <div className="h-16 flex items-center justify-between border-b border-border px-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <Image src="/icon.svg" alt={appConfig.name} width={32} height={32} />
          </div>
          <span className="font-semibold text-xl text-foreground group-hover:text-primary/80 transition-colors">{appConfig.name}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(false)}
          className="h-8 w-8 rounded-lg hover:bg-accent active:bg-accent/80"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 2. New Chat Button */}
        <div className="p-3 shrink-0">
          <Button
            onClick={handleCreateSession}
            className="w-full btn-hand gap-2"
            disabled={!hasConfig || isCreating}
          >
            {isCreating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            <span>{isCreating ? '创建中...' : '新建会话'}</span>
          </Button>

          {/* 无配置提示 */}
          {!hasConfig && (
            <Alert className="mt-2 py-2 px-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                请先配置{' '}
                <Link href="/settings?tab=llm-api" className="underline font-medium">
                  LLM API
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* 3. Archived Toggle Switch */}
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              已归档会话
            </span>
            <Switch
              size="sm"
              checked={showArchived}
              onCheckedChange={handleToggleArchived}
            />
          </div>
        </div>

        {/* 4. Chat List */}
        <ScrollArea className="flex-1 min-h-0 [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div
            key={showArchived ? 'archived' : 'active'}
            className="flex flex-col gap-1 p-2 animate-in fade-in slide-in-from-left-2 duration-300"
          >
            {displayedSessions.length === 0 && !isLoading && (
               <div className="text-center text-muted-foreground text-sm py-4">
                 {showArchived ? '暂无已归档会话' : '暂无会话'}
               </div>
            )}

            <AnimatePresence initial={false}>
              {displayedSessions.map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, x: -40 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 500, damping: 35 },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 },
                  }}
                  onClick={() => router.push(`/chat?sessionId=${session.id}`)}
                  className={cn(
                    'group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border border-border rounded-lg hover:bg-accent/30 active:bg-accent/50',
                    currentSessionId === session.id && 'bg-primary/10 border-primary/30 shadow-sm'
                  )}
                >
                <div className="flex-1 min-w-0 pr-7">
                  <div className="flex items-center gap-1.5">
                     <span className={cn("font-medium text-sm truncate", currentSessionId === session.id ? "text-foreground" : "text-muted-foreground")}>
                       {session.isPinned && <Pin className="inline w-3 h-3 mr-1 text-primary" />}
                       {session.title || '未命名会话'}
                     </span>
                     {session.status === 'paused' && (
                       <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950">
                         暂停
                       </Badge>
                     )}
                     {session.initializing && (
                       <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4 text-blue-600 border-blue-300 bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:bg-blue-950 animate-pulse">
                         初始化中
                       </Badge>
                     )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {session.lastMessage?.content || session.description || '无预览'}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className="p-1 hover:bg-background active:bg-accent/50 rounded-full transition-opacity opacity-50 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 focus:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {session.isPinned ? (
                      <DropdownMenuItem onClick={(e) => handleUnpinSession(e, session.id)}>
                        <PinOff className="w-4 h-4 mr-2" />
                        取消置顶
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={(e) => handlePinSession(e, session.id)}>
                        <Pin className="w-4 h-4 mr-2" />
                        置顶
                      </DropdownMenuItem>
                    )}
                    {session.status === 'paused' ? (
                      <DropdownMenuItem onClick={(e) => handleResumeSession(e, session.id)}>
                        <Play className="w-4 h-4 mr-2" />
                        恢复
                      </DropdownMenuItem>
                    ) : session.status === 'active' ? (
                      <DropdownMenuItem onClick={(e) => handlePauseSession(e, session.id)}>
                        <Pause className="w-4 h-4 mr-2" />
                        暂停
                      </DropdownMenuItem>
                    ) : null}
                    {session.status === 'archived' ? (
                      <DropdownMenuItem onClick={(e) => handleUnarchiveSession(e, session.id)}>
                        <Archive className="w-4 h-4 mr-2" />
                        取消归档
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={(e) => handleArchiveSession(e, session.id)}>
                        <Archive className="w-4 h-4 mr-2" />
                        归档
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={(e) => handleShareClick(e, session.id)}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      分享
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => handleDeleteClick(e, session)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </aside>

    {/* Delete confirmation dialog */}
    <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除会话</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>确定要删除「{deleteConfirm?.sessionTitle}」吗？此操作不可撤销。</p>
              {deleteConfirm?.checking ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">检查分享链接...</span>
                </div>
              ) : deleteConfirm && deleteConfirm.shareCount > 0 ? (
                <div className="flex items-start gap-2 text-destructive text-xs py-1">
                  <Share2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    该会话有 <strong>{deleteConfirm.shareCount}</strong> 个分享链接，删除后所有分享链接将失效。
                  </span>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={deleteConfirm?.checking}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Share dialog */}
    {shareDialogSessionId && (
      <ShareDialog
        open={true}
        onOpenChange={(open) => !open && setShareDialogSessionId(null)}
        sessionId={shareDialogSessionId}
      />
    )}
    </>
  );
}

