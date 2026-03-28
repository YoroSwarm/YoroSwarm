'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { useWorkspacesStore } from '@/stores';
import { useSessionsStore } from '@/stores';
import type { Session } from '@/types/chat';
import type { WorkspaceResponse } from '@/lib/api/workspaces';

interface WorkspaceTreeProps {
  currentSessionId: string | null;
  onCreateSession: (workspaceId: string) => void;
  isCreatingSession: boolean;
}

export function WorkspaceTree({ currentSessionId, onCreateSession, isCreatingSession }: WorkspaceTreeProps) {
  const router = useRouter();
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const loadWorkspaces = useWorkspacesStore((s) => s.loadWorkspaces);
  const currentWorkspaceId = useWorkspacesStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspacesStore((s) => s.setCurrentWorkspace);
  const deleteWorkspace = useWorkspacesStore((s) => s.deleteWorkspace);
  const updateWorkspace = useWorkspacesStore((s) => s.updateWorkspace);

  const sessions = useSessionsStore((s) => s.sessions);
  const isLoading = useSessionsStore((s) => s.isLoading);

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // Load workspaces on mount
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  // Auto-expand current workspace
  useEffect(() => {
    if (currentWorkspaceId && !expandedWorkspaces.has(currentWorkspaceId)) {
      setExpandedWorkspaces((prev) => new Set([...prev, currentWorkspaceId]));
    }
  }, [currentWorkspaceId]);

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const sessionsInWorkspace = useCallback(
    (workspaceId: string) => {
      const inWs = sessions.filter((s) => s.workspaceId === workspaceId);
      if (showArchived) {
        return inWs.filter((s) => s.status === 'archived');
      }
      return inWs.filter((s) => s.status !== 'archived');
    },
    [sessions, showArchived]
  );

  const handleDeleteWorkspace = async () => {
    if (!deleteWorkspaceId) return;
    setDeleting(true);
    try {
      await deleteWorkspace(deleteWorkspaceId);
    } finally {
      setDeleting(false);
      setDeleteWorkspaceId(null);
    }
  };

  const handleRenameWorkspace = async () => {
    if (!editingWorkspaceId || !editingName.trim()) return;
    await updateWorkspace(editingWorkspaceId, editingName.trim());
    setEditingWorkspaceId(null);
    setEditingName('');
  };

  const handleWorkspaceClick = (workspace: WorkspaceResponse) => {
    setCurrentWorkspace(workspace.id);
    if (!expandedWorkspaces.has(workspace.id)) {
      toggleWorkspace(workspace.id);
    }
  };

  return (
    <>
      <ConfirmDialogComponent />
      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(workspaceId) => {
          setCurrentWorkspace(workspaceId);
          setExpandedWorkspaces((prev) => new Set([...prev, workspaceId]));
        }}
      />

      <div className="flex flex-col h-full">
        {/* Header: New workspace button + archive toggle */}
        <div className="p-3 shrink-0 space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="w-full justify-start text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建工作空间
          </Button>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">已归档</span>
            <Button
              variant="ghost"
              onClick={() => setShowArchived((v) => !v)}
              className={cn('h-6 text-xs', showArchived && 'bg-accent')}
            >
              {showArchived ? '隐藏' : '显示'}
            </Button>
          </div>
        </div>

        {/* Workspace tree */}
        <ScrollArea className="flex-1 min-h-0 [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-1 p-2">
            {workspaces.length === 0 && !isLoading && (
              <div className="text-center text-muted-foreground text-sm py-8 px-4">
                <p>还没有工作空间</p>
                <p className="text-xs mt-1">点击上方「新建工作空间」开始</p>
              </div>
            )}

            <AnimatePresence initial={false}>
              {workspaces.map((workspace) => {
                const isExpanded = expandedWorkspaces.has(workspace.id);
                const isActive = currentWorkspaceId === workspace.id;
                const wsSessions = sessionsInWorkspace(workspace.id);

                return (
                  <div key={workspace.id} className="space-y-0.5">
                    {/* Workspace header */}
                    <div
                      className={cn(
                        'group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                        isActive && 'bg-primary/10',
                        !isActive && 'hover:bg-accent/50'
                      )}
                    >
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleWorkspace(workspace.id)}
                        className="p-0.5 hover:bg-accent rounded transition-colors shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Workspace icon + name */}
                      <button
                        onClick={() => handleWorkspaceClick(workspace)}
                        className="flex-1 flex items-center gap-1.5 min-w-0"
                      >
                        <span className="text-base">📁</span>
                        {editingWorkspaceId === workspace.id ? (
                          <input
                            className="flex-1 bg-transparent border border-primary rounded px-1 py-0 text-sm focus:outline-none min-w-0"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => void handleRenameWorkspace()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleRenameWorkspace();
                              if (e.key === 'Escape') {
                                setEditingWorkspaceId(null);
                                setEditingName('');
                              }
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className={cn(
                            'text-sm font-medium truncate',
                            isActive ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {workspace.name}
                          </span>
                        )}
                      </button>

                      {/* Session count badge */}
                      {!showArchived && workspace.activeSessionCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          {workspace.activeSessionCount}
                        </Badge>
                      )}

                      {/* Context menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWorkspaceId(workspace.id);
                              setEditingName(workspace.name);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            重命名
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteWorkspaceId(workspace.id);
                            }}
                            variant="destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Sessions under this workspace */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="pl-4 space-y-0.5 overflow-hidden"
                      >
                        {wsSessions.length === 0 && !isLoading && (
                          <div className="text-center text-muted-foreground text-xs py-2">
                            {showArchived ? '无归档会话' : '无会话'}
                          </div>
                        )}

                        {wsSessions.map((session) => (
                          <SessionItem
                            key={session.id}
                            session={session}
                            currentSessionId={currentSessionId}
                            onClick={() => router.push(`/chat?sessionId=${session.id}`)}
                          />
                        ))}

                        {/* Create session button in workspace */}
                        {!showArchived && (
                          <button
                            onClick={() => onCreateSession(workspace.id)}
                            disabled={isCreatingSession}
                            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded-md transition-colors disabled:opacity-50"
                          >
                            {isCreatingSession && currentWorkspaceId === workspace.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            新建会话
                          </button>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>

      {/* Delete workspace confirmation */}
      <AlertDialog open={!!deleteWorkspaceId} onOpenChange={(open) => !open && setDeleteWorkspaceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除工作空间</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>确定要删除此工作空间吗？</p>
                <p className="text-sm text-muted-foreground">
                  这将同时删除其中的所有会话和文件。此操作不可撤销。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteWorkspace()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SessionItem({
  session,
  currentSessionId,
  onClick,
}: {
  session: Session;
  currentSessionId: string | null;
  onClick: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const deleteSession = useSessionsStore((s) => s.deleteSession);
  const archiveSession = useSessionsStore((s) => s.archiveSession);
  const unarchiveSession = useSessionsStore((s) => s.unarchiveSession);
  const pinSession = useSessionsStore((s) => s.pinSession);
  const unpinSession = useSessionsStore((s) => s.unpinSession);
  const pauseSession = useSessionsStore((s) => s.pauseSession);
  const resumeSession = useSessionsStore((s) => s.resumeSession);

  const isActive = currentSessionId === session.id;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border border-border rounded-lg hover:bg-accent/30 active:bg-accent/50',
        isActive && 'bg-primary/10 border-primary/30 shadow-sm'
      )}
    >
      <div className="flex-1 min-w-0 pr-7">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-medium text-sm truncate',
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {session.isPinned && <span className="mr-1">📌</span>}
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
          {session.venvError && !session.initializing && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4 text-red-600 border-red-300 bg-red-50 dark:text-red-400 dark:border-red-700 dark:bg-red-950">
              异常
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {session.lastMessage?.content || session.description || '无预览'}
        </p>
      </div>

      <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1 hover:bg-background active:bg-accent/50 rounded-full transition-opacity opacity-50 group-hover:opacity-100 focus:opacity-100 absolute right-2 top-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {session.isPinned ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void unpinSession(session.id); }}>
              取消置顶
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void pinSession(session.id); }}>
              置顶
            </DropdownMenuItem>
          )}
          {session.status === 'paused' ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void resumeSession(session.id); }}>
              恢复
            </DropdownMenuItem>
          ) : session.status === 'active' ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void pauseSession(session.id); }}>
              暂停
            </DropdownMenuItem>
          ) : null}
          {session.status === 'archived' ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void unarchiveSession(session.id); }}>
              取消归档
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void archiveSession(session.id); }}>
              归档
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              void deleteSession(session.id);
            }}
          >
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
