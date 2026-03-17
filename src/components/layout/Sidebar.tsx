'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  MoreVertical,
  Trash2,
  Archive,
  PanelLeftClose,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { useSessions } from '@/hooks/use-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';



export function Sidebar() {
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get('sessionId');

  const {
    sessions,
    isLoading,
    createSession,
    deleteSession,
    archiveSession,
    pauseSession,
    resumeSession,
  } = useSessions();

  const handleCreateSession = async () => {
    try {
      const created = await createSession();
      router.push(`/chat?sessionId=${created.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    if (currentSessionId === sessionId) {
      router.push('/chat');
    }
  };

  const handleArchiveSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await archiveSession(sessionId);
  };

  const handlePauseSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await pauseSession(sessionId);
  };

  const handleResumeSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await resumeSession(sessionId);
  };

  return (
    <aside
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300 relative z-20 shrink-0',
        'w-72'
      )}
    >
      {/* 1. Logo (Return to Dashboard) + Close Button */}
      <div className="h-16 flex items-center justify-between border-b border-border px-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center shrink-0 border border-border/50 group-hover:border-border transition-all shadow-md group-hover:shadow-lg">
            <Image src="/icon.svg" alt="Swarm" width={24} height={24} />
          </div>
          <span className="font-semibold text-xl text-foreground group-hover:translate-x-1 transition-transform">Swarm</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(false)}
          className="h-8 w-8 rounded-lg hover:bg-accent"
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
          >
            <Plus className="w-5 h-5" />
            <span>新建会话</span>
          </Button>
        </div>

        {/* 4. Chat List */}
        <ScrollArea className="flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="space-y-1 p-2">
            {sessions.length === 0 && !isLoading && (
               <div className="text-center text-muted-foreground text-sm py-4">
                 暂无会话
               </div>
            )}
            
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => router.push(`/chat?sessionId=${session.id}`)}
                className={cn(
                  'group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-all border border-border rounded-lg hover:bg-accent/30',
                  currentSessionId === session.id && 'bg-primary/10 border-primary/30 shadow-sm'
                )}
              >
                <div className="flex-1 min-w-0 pr-7">
                  <div className="flex items-center gap-1.5">
                     <span className={cn("font-medium text-sm truncate", currentSessionId === session.id ? "text-foreground" : "text-muted-foreground")}>
                       {session.title || '未命名会话'}
                     </span>
                     {session.status === 'paused' && (
                       <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950">
                         暂停
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
                      className="p-1 hover:bg-background rounded-full transition-opacity opacity-50 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 focus:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
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
                    <DropdownMenuItem onClick={(e) => handleArchiveSession(e, session.id)}>
                      <Archive className="w-4 h-4 mr-2" />
                      归档
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

