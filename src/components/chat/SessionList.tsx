'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatSessionTime } from '@/lib/utils/date';
import type { Session } from '@/types/chat';
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Archive,
  MessageSquare,
  X,
  Loader2,
} from 'lucide-react';

interface SessionListProps {
  sessions: Session[];
  isLoading?: boolean;
  error?: string | null;
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => Promise<void> | void;
  onArchiveSession: (sessionId: string) => Promise<void> | void;
  onCloseMobile?: () => void;
}

export function SessionList({
  sessions,
  isLoading = false,
  error = null,
  currentSessionId,
  onSessionSelect,
  onCreateSession,
  onDeleteSession,
  onArchiveSession,
  onCloseMobile,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesSearch =
        session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && session.status !== 'deleted';
    });
  }, [sessions, searchQuery]);

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onDeleteSession(sessionId);
      setActiveMenuId(null);
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  const handleArchiveSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onArchiveSession(sessionId);
      setActiveMenuId(null);
    } catch (err) {
      console.error('归档会话失败:', err);
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">会话</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateSession}
            className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
            title="创建会话"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新建</span>
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-2 rounded-md hover:bg-accent transition-colors lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">加载中...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">没有找到会话</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={cn(
                  'group relative flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-accent/50',
                  currentSessionId === session.id && 'bg-accent'
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                  {session.title.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={cn(
                        'truncate text-sm font-medium',
                        session.unreadCount > 0 && 'font-semibold'
                      )}
                    >
                      {session.title}
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSessionTime(session.updatedAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {session.description || session.lastMessage?.content || '无消息'}
                  </p>
                </div>

                {session.unreadCount > 0 && (
                  <div className="absolute right-10 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {session.unreadCount > 99 ? '99+' : session.unreadCount}
                  </div>
                )}

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === session.id ? null : session.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {activeMenuId === session.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setActiveMenuId(null)}
                      />
                      <div className="absolute right-0 top-8 z-50 w-40 rounded-md border border-border bg-popover shadow-lg animate-fade-in">
                        <button
                          onClick={(e) => handleArchiveSession(session.id, e)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                        >
                          <Archive className="h-4 w-4" />
                          归档
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        共 {filteredSessions.length} 个会话
      </div>
    </div>
  );
}
