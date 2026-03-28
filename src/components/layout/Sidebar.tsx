'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  MoreVertical,
  Trash2,
  Archive,
  PanelLeftClose,
  AlertCircle,
  Share2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { appConfig } from '@/lib/config/app';
import { useUIStore, useLlmConfigsStore, useSessionsStore, useWorkspacesStore } from '@/stores';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';
import { useSessions } from '@/hooks/use-sessions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { swarmSessionsApi } from '@/lib/api/swarm-sessions';
import { workspacesApi } from '@/lib/api/workspaces';
import { ShareDialog } from '@/components/session/ShareDialog';
import { WorkspaceTree } from './WorkspaceTree';

export function Sidebar() {
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const { glassEffect } = useLeadPreferencesStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get('sessionId');
  const [isCreating, setIsCreating] = useState(false);

  // 保存归档状态到 storage (kept for compatibility)
  useEffect(() => {
    // No-op - archive state is now managed in WorkspaceTree
  }, []);

  // 会话初始化轮询状态
  const initializingWorkspacesRef = useRef<Set<string>>(new Set());

  // 确认对话框
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // LLM API 配置检查
  const { hasConfig, loadHasConfig } = useLlmConfigsStore();

  // 加载配置状态
  useEffect(() => {
    loadHasConfig();
  }, [loadHasConfig]);

  const {
    sessions,
    isLoading,
    createSession,
    deleteSession,
  } = useSessions();

  // 轮询工作区 venv 初始化状态（用于新创建的会话，快速反馈）
  const pollWorkspaceVenvStatus = useCallback(async (workspaceId: string) => {
    if (initializingWorkspacesRef.current.has(workspaceId)) return;
    initializingWorkspacesRef.current.add(workspaceId);

    const checkStatus = async () => {
      // 检查是否仍然需要轮询
      if (!initializingWorkspacesRef.current.has(workspaceId)) return;

      try {
        const status = await workspacesApi.getWorkspaceStatus(workspaceId);
        // 再次检查，因为可能在 API 调用期间状态已改变
        if (!initializingWorkspacesRef.current.has(workspaceId)) return;

        if (status.venvReady && status.workspaceReady) {
          // 初始化完成，移除标记并清除状态
          initializingWorkspacesRef.current.delete(workspaceId);
          useWorkspacesStore.getState().setWorkspaceInitializing(workspaceId, false);
          useWorkspacesStore.getState().setWorkspaceVenvError(workspaceId, false);
          return;
        }
        // 检查是否是错误状态
        if (status.venvStatus === 'error') {
          initializingWorkspacesRef.current.delete(workspaceId);
          useWorkspacesStore.getState().setWorkspaceInitializing(workspaceId, false);
          useWorkspacesStore.getState().setWorkspaceVenvError(workspaceId, true);
          return;
        }

        // 还在初始化中，继续轮询
        if (initializingWorkspacesRef.current.has(workspaceId)) {
          setTimeout(checkStatus, 2000);
        }
      } catch {
        // API 出错时停止轮询，避免无限重试
        initializingWorkspacesRef.current.delete(workspaceId);
      }
    };

    await checkStatus();
  }, []);

  const handleCreateSession = async (workspaceId: string) => {
    setIsCreating(true);
    try {
      const created = await createSession(workspaceId);
      // 设置工作区初始化状态并开始轮询
      useWorkspacesStore.getState().setWorkspaceInitializing(workspaceId, true);
      pollWorkspaceVenvStatus(workspaceId);
      router.push(`/chat?sessionId=${created.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'FORBIDDEN') {
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
    const sessionIdToDelete = deleteConfirm.sessionId;
    const wasCurrentSession = currentSessionId === sessionIdToDelete;

    await deleteSession(sessionIdToDelete);

    if (wasCurrentSession) {
      // 删除当前会话后，直接从 store 获取最新的 sessions
      const sessionsState = useSessionsStore.getState();
      const workspacesState = useWorkspacesStore.getState();
      const archivedWorkspaceIds = new Set(
        workspacesState.workspaces.filter((w) => w.archivedAt).map((w) => w.id)
      );
      const remainingSessions = sessionsState.sessions.filter(
        (s) => s.id !== sessionIdToDelete && !archivedWorkspaceIds.has(s.workspaceId)
      );
      if (remainingSessions.length > 0) {
        // 跳转到第一个有效会话，而不是先跳 /chat 再自动跳转
        router.push(`/chat?sessionId=${remainingSessions[0].id}`);
      } else {
        // 没有剩余会话，跳到 /chat 显示空状态
        router.push('/chat');
      }
    }
    setDeleteConfirm(null);
  };

  // 处理来自 WorkspaceTree SessionItem 的删除请求
  const handleDeleteSession = useCallback(async (sessionId: string, wasCurrentSession: boolean) => {
    await deleteSession(sessionId);

    if (wasCurrentSession) {
      const sessionsState = useSessionsStore.getState();
      const workspacesState = useWorkspacesStore.getState();
      const archivedWorkspaceIds = new Set(
        workspacesState.workspaces.filter((w) => w.archivedAt).map((w) => w.id)
      );
      const validSessions = sessionsState.sessions.filter(
        (s) => s.id !== sessionId && !archivedWorkspaceIds.has(s.workspaceId)
      );
      if (validSessions.length > 0) {
        router.push(`/chat?sessionId=${validSessions[0].id}`);
      } else {
        router.push('/chat');
      }
    }
  }, [deleteSession, router]);

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
        {/* 2. Workspace Tree */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <WorkspaceTree
            currentSessionId={currentSessionId}
            onCreateSession={async (workspaceId) => {
              const currentWs = useWorkspacesStore.getState().currentWorkspaceId;
              if (currentWs !== workspaceId) {
                useWorkspacesStore.getState().setCurrentWorkspace(workspaceId);
              }
              if (!hasConfig) {
                const confirmed = await confirm({
                  title: '需要配置 LLM API',
                  description: '您需要先配置 LLM API 才能创建会话。是否前往设置？',
                  confirmLabel: '前往设置',
                  cancelLabel: '取消',
                });
                if (confirmed) router.push('/settings?tab=llm-api');
                return;
              }
              void handleCreateSession(workspaceId);
            }}
            isCreatingSession={isCreating}
            onDeleteSession={handleDeleteSession}
          />
        </div>

        {/* 无配置提示 */}
        {!hasConfig && (
          <div className="p-3 shrink-0 border-t border-border">
            <Alert className="py-2 px-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                请先配置{' '}
                <Link href="/settings?tab=llm-api" className="underline font-medium">
                  LLM API
                </Link>
              </AlertDescription>
            </Alert>
          </div>
        )}
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

