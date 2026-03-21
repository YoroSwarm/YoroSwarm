'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatSessionTime } from '@/lib/utils/date';
import type { Session } from '@/types/chat';
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Archive,
  X,
  AlertCircle,
  Pause,
  Play,
  Pin,
  PinOff,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface SessionListProps {
  sessions: Session[];
  isLoading?: boolean;
  error?: string | null;
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => Promise<void> | void;
  onArchiveSession: (sessionId: string) => Promise<void> | void;
  onPauseSession?: (sessionId: string) => Promise<void> | void;
  onResumeSession?: (sessionId: string) => Promise<void> | void;
  onPinSession?: (sessionId: string) => Promise<void> | void;
  onUnpinSession?: (sessionId: string) => Promise<void> | void;
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
  onPauseSession,
  onResumeSession,
  onPinSession,
  onUnpinSession,
  onCloseMobile,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesSearch =
        session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && session.status !== 'deleted';
    });
  }, [sessions, searchQuery]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await onDeleteSession(sessionId);
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  const handleArchiveSession = async (sessionId: string) => {
    try {
      await onArchiveSession(sessionId);
    } catch (err) {
      console.error('归档会话失败:', err);
    }
  };

  const handlePauseSession = async (sessionId: string) => {
    try {
      await onPauseSession?.(sessionId);
    } catch (err) {
      console.error('暂停会话失败:', err);
    }
  };

  const handleResumeSession = async (sessionId: string) => {
    try {
      await onResumeSession?.(sessionId);
    } catch (err) {
      console.error('恢复会话失败:', err);
    }
  };

  const handlePinSession = async (sessionId: string) => {
    try {
      await onPinSession?.(sessionId);
    } catch (err) {
      console.error('置顶会话失败:', err);
    }
  };

  const handleUnpinSession = async (sessionId: string) => {
    try {
      await onUnpinSession?.(sessionId);
    } catch (err) {
      console.error('取消置顶失败:', err);
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Image src="/icon.svg" alt="" width={20} height={20} className="opacity-70" />
          <h2 className="font-semibold text-lg">会话</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateSession}
            title="创建会话"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新建</span>
          </Button>
          {onCloseMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCloseMobile}
              className="lg:hidden h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-3 mt-2 rounded-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="h-10 w-10 mb-2 opacity-40 flex items-center justify-center">
              <Image src="/icon.svg" alt="" width={28} height={28} />
            </div>
            <p className="text-sm">没有找到会话</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredSessions.map((session, index) => (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={cn(
                  'group relative flex cursor-pointer items-start gap-3 p-3 transition-all hover:bg-accent/50 active:bg-accent/70 animate-fade-in',
                  currentSessionId === session.id && 'bg-accent'
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <Avatar size="lg">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {session.title.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={cn(
                        'truncate text-sm font-medium',
                        session.unreadCount > 0 && 'font-semibold'
                      )}
                    >
                      {session.isPinned && (
                        <Pin className="inline h-3 w-3 mr-1 text-primary shrink-0" />
                      )}
                      {session.title}
                    </h3>
                    {session.status === 'paused' && (
                      <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950">
                        已暂停
                      </Badge>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSessionTime(session.updatedAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {session.description || session.lastMessage?.content || '无消息'}
                  </p>
                </div>

                {session.unreadCount > 0 && (
                  <Badge className="absolute right-10 top-3">
                    {session.unreadCount > 99 ? '99+' : session.unreadCount}
                  </Badge>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-all h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {session.isPinned ? (
                      <DropdownMenuItem onClick={() => handleUnpinSession(session.id)}>
                        <PinOff className="h-4 w-4" />
                        取消置顶
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handlePinSession(session.id)}>
                        <Pin className="h-4 w-4" />
                        置顶
                      </DropdownMenuItem>
                    )}
                    {session.status === 'paused' ? (
                      <DropdownMenuItem onClick={() => handleResumeSession(session.id)}>
                        <Play className="h-4 w-4" />
                        恢复
                      </DropdownMenuItem>
                    ) : session.status === 'active' ? (
                      <DropdownMenuItem onClick={() => handlePauseSession(session.id)}>
                        <Pause className="h-4 w-4" />
                        暂停
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => handleArchiveSession(session.id)}>
                      <Archive className="h-4 w-4" />
                      归档
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDeleteSession(session.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        共 {filteredSessions.length} 个会话
      </div>
    </div>
  );
}
