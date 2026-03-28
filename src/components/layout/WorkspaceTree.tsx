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
  Loader2,
  Pause,
  AlertCircle,
  Pin,
  Pencil,
  Archive,
  ArchiveRestore,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { RenameWorkspaceDialog } from './RenameWorkspaceDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const archiveWorkspace = useWorkspacesStore((s) => s.archiveWorkspace);
  const unarchiveWorkspace = useWorkspacesStore((s) => s.unarchiveWorkspace);

  const sessions = useSessionsStore((s) => s.sessions);
  const isLoading = useSessionsStore((s) => s.isLoading);

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [archivedSessionsOpen, setArchivedSessionsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(null);
  const [renameWorkspaceName, setRenameWorkspaceName] = useState('');
  const [renameWorkspaceDescription, setRenameWorkspaceDescription] = useState<string | null>(null);
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { Dialog: ConfirmDialogComponent } = useConfirmDialog();

  // Load workspaces on mount
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);


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
      return sessions.filter((s) => s.workspaceId === workspaceId && s.status !== 'archived');
    },
    [sessions]
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

  const handleRenameWorkspace = (workspace: WorkspaceResponse) => {
    setRenameWorkspaceId(workspace.id);
    setRenameWorkspaceName(workspace.name);
    setRenameWorkspaceDescription(workspace.description);
    setRenameDialogOpen(true);
  };

  const handleWorkspaceClick = (e: React.MouseEvent, workspace: WorkspaceResponse) => {
    // Only handle clicks directly on the header, not bubbled from buttons
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button')) {
      return;
    }
    setCurrentWorkspace(workspace.id);
    toggleWorkspace(workspace.id);
  };

  const handleToggleWorkspace = (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    toggleWorkspace(workspaceId);
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
      <RenameWorkspaceDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        workspaceId={renameWorkspaceId || ''}
        currentName={renameWorkspaceName}
        currentDescription={renameWorkspaceDescription}
      />

      <div className="flex flex-col h-full">
        {/* Header: New workspace button */}
        <div className="p-3 shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="w-full justify-center text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建工作空间
          </Button>
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
              {workspaces.filter((w) => !w.archivedAt).map((workspace) => {
                const isExpanded = expandedWorkspaces.has(workspace.id);
                const isActive = currentWorkspaceId === workspace.id;
                const wsSessions = sessionsInWorkspace(workspace.id);

                return (
                  <motion.div
                    key={workspace.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="space-y-0.5"
                  >
                    {/* Workspace header - click anywhere to toggle */}
                    <div
                      onClick={(e) => handleWorkspaceClick(e, workspace)}
                      className={cn(
                        'group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                        isActive && !currentSessionId ? 'bg-primary/10 hover:bg-primary/5' : 'hover:bg-accent/50'
                      )}
                    >
                      {/* Expand toggle */}
                      <button
                        onClick={(e) => handleToggleWorkspace(e, workspace.id)}
                        className="p-0.5 shrink-0 hover:bg-accent rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Workspace name */}
                      <span
                        className={cn(
                          'flex-1 text-sm font-medium truncate',
                          isActive && !currentSessionId ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {workspace.name}
                      </span>

                      {/* New session button */}
                      <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentWorkspace(workspace.id);
                            onCreateSession(workspace.id);
                          }}
                          disabled={isCreatingSession}
                          className="p-1 hover:bg-accent rounded transition-colors shrink-0"
                          title="新建会话"
                        >
                          {isCreatingSession && currentWorkspaceId === workspace.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>

                      {/* More button */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1 hover:bg-accent rounded transition-colors shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameWorkspace(workspace);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            重命名
                          </DropdownMenuItem>
                          {workspace.archivedAt ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void unarchiveWorkspace(workspace.id);
                              }}
                            >
                              <ArchiveRestore className="w-4 h-4 mr-2" />
                              取消归档
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void archiveWorkspace(workspace.id);
                              }}
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              归档
                            </DropdownMenuItem>
                          )}
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
                    <AnimatePresence>
                      {isExpanded ? (
                        <motion.div
                          key="sessions"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="pl-3 space-y-0.5 overflow-hidden"
                        >
                          {wsSessions.length === 0 && !isLoading && (
                            <div className="text-center text-muted-foreground text-xs py-2">
                              无会话
                            </div>
                          )}

                          {wsSessions.map((session) => (
                            <motion.div
                              key={session.id}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -8 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                            >
                              <SessionItem
                                session={session}
                                currentSessionId={currentSessionId}
                                onClick={() => router.push(`/chat?sessionId=${session.id}`)}
                              />
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Archived workspaces link - fixed at bottom */}
        {workspaces.filter((w) => w.archivedAt).length > 0 && (
          <div className="p-3 border-t shrink-0">
            <button
              onClick={() => setArchivedSessionsOpen(true)}
              className="flex items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              已归档工作区
              <span className="text-xs bg-muted rounded-full px-1.5 py-0.5">
                {workspaces.filter((w) => w.archivedAt).length}
              </span>
            </button>
          </div>
        )}
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

      {/* Archived workspaces modal */}
      <Dialog open={archivedSessionsOpen} onOpenChange={setArchivedSessionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              已归档工作区
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] mt-4">
            <div className="space-y-2">
              {workspaces
                .filter((w) => w.archivedAt)
                .map((workspace) => (
                  <ArchivedWorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    sessions={sessions.filter((s) => s.workspaceId === workspace.id)}
                    onUnarchive={() => {
                      void unarchiveWorkspace(workspace.id);
                      setArchivedSessionsOpen(false);
                    }}
                  />
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ArchivedWorkspaceItem({
  workspace,
  sessions,
  onUnarchive,
}: {
  workspace: WorkspaceResponse;
  sessions: Session[];
  onUnarchive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={cn(
            'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{workspace.name}</div>
          <div className="text-xs text-muted-foreground">
            {workspace.sessionCount} 个会话
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onUnarchive();
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
        >
          <ArchiveRestore className="w-4 h-4" />
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 bg-muted/30 border-t space-y-2">
              <div className="text-xs text-muted-foreground">
                <div className="flex gap-4">
                  <span>创建于: {formatDate(workspace.createdAt)}</span>
                  <span>归档于: {formatDate(workspace.archivedAt)}</span>
                </div>
              </div>
              {workspace.description && (
                <div className="text-sm text-muted-foreground">{workspace.description}</div>
              )}
              {sessions.length > 0 ? (
                <div className="space-y-1 pt-1">
                  <div className="text-xs font-medium text-muted-foreground">会话列表:</div>
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background/50"
                    >
                      <span className="truncate flex-1">{session.title || '未命名会话'}</span>
                      <span className="text-muted-foreground shrink-0">
                        {session.status === 'archived' ? '已归档' : session.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic pt-1">无会话</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const pinSession = useSessionsStore((s) => s.pinSession);
  const unpinSession = useSessionsStore((s) => s.unpinSession);
  const pauseSession = useSessionsStore((s) => s.pauseSession);
  const resumeSession = useSessionsStore((s) => s.resumeSession);

  const isActive = currentSessionId === session.id;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors rounded hover:bg-accent/30 active:bg-accent/50',
        isActive && 'bg-primary/10 shadow-sm'
      )}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-1">
          {session.isPinned && (
            <Pin className="w-3 h-3 shrink-0 text-muted-foreground fill-current" />
          )}
          {session.venvError && !session.initializing && (
            <AlertCircle className="w-3 h-3 shrink-0 text-red-500" />
          )}
          {session.initializing && (
            <Loader2 className="w-3 h-3 shrink-0 text-blue-500 animate-spin" />
          )}
          {session.status === 'paused' && (
            <Pause className="w-3 h-3 shrink-0 text-amber-500" />
          )}
          <span className={cn(
            'font-medium text-xs truncate',
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {session.title || '未命名会话'}
          </span>
        </div>
      </div>

      {/* More button - only visible on hover */}
      <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
        <DropdownMenuTrigger asChild>
          <button
            className="p-0.5 hover:bg-accent rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 absolute right-2 top-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-3 h-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {session.isPinned ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void unpinSession(session.id); }}>
              <Pin className="w-4 h-4 mr-2" />
              取消置顶
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void pinSession(session.id); }}>
              <Pin className="w-4 h-4 mr-2" />
              置顶
            </DropdownMenuItem>
          )}
          {session.status === 'paused' ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void resumeSession(session.id); }}>
              <Play className="w-4 h-4 mr-2" />
              恢复
            </DropdownMenuItem>
          ) : session.status === 'active' ? (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void pauseSession(session.id); }}>
              <Pause className="w-4 h-4 mr-2" />
              暂停
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              void deleteSession(session.id);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
