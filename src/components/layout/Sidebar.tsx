'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  User,
  MessageSquare,
  MoreVertical,
  Trash2,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useSidebar } from '@/stores';
import { useSessions } from '@/hooks/use-sessions';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatSessionTime } from '@/lib/utils/date';
import { useState } from 'react';

export function Sidebar() {
  const { sidebarOpen: collapsed, toggleSidebar: toggleCollapsed } = useSidebar();
  const { user, logout } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get('sessionId');

  const {
    sessions,
    isLoading,
    createSession,
    deleteSession,
    archiveSession,
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

  return (
    <aside
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300 relative z-20 shrink-0',
        collapsed ? 'w-16' : 'w-72'
      )}
    >
      {/* 1. Logo (Return to Dashboard) */}
      <div className="h-16 flex items-center justify-center border-b border-border px-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary to-secondary flex items-center justify-center shrink-0 border border-transparent group-hover:border-border transition-all shadow-md group-hover:shadow-lg">
            <span className="text-primary-foreground font-semibold text-sm">S</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-xl text-foreground group-hover:translate-x-1 transition-transform">Swarm</span>
          )}
        </Link>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 2. Task Management */}
        <div className="p-3 border-b border-border/50 shrink-0">
          <Link
            href="/tasks"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all border-2 border-transparent',
              'hover:bg-accent hover:text-accent-foreground hover:border-border',
              pathname === '/tasks'
                ? 'bg-primary/5 text-primary border-border shadow-sm'
                : 'text-muted-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <CheckSquare className="w-5 h-5 shrink-0" />
            {!collapsed && <span>任务管理</span>}
          </Link>
        </div>

        {/* 3. New Chat Button */}
        <div className="p-3 shrink-0">
          <Button
            onClick={handleCreateSession}
            className={cn(
              "w-full btn-hand gap-2",
              collapsed && "px-0 justify-center w-10 h-10"
            )}
          >
            <Plus className="w-5 h-5" />
            {!collapsed && <span>新建会话</span>}
          </Button>
        </div>

        {/* 4. Chat List */}
        <ScrollArea className="flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="space-y-1 p-2">
            {!collapsed && sessions.length === 0 && !isLoading && (
               <div className="text-center text-muted-foreground text-sm py-4">
                 暂无会话
               </div>
            )}
            
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => router.push(`/chat?sessionId=${session.id}`)}
                className={cn(
                  'group relative flex items-center gap-3 px-3 py-3 cursor-pointer transition-all',
                  collapsed 
                    ? 'justify-center px-2 rounded-lg border-2 border-border' 
                    : 'border-2 border-border rounded-lg hover:bg-accent/50',
                  !collapsed && currentSessionId === session.id
                    ? 'bg-accent shadow-sm'
                    : collapsed && currentSessionId === session.id
                      ? 'bg-accent/20'
                      : ''
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 border border-border">
                   <AvatarFallback className="bg-muted text-foreground font-semibold">
                     {session.title.slice(0, 1).toUpperCase()}
                   </AvatarFallback>
                </Avatar>
                
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                       <span className={cn("font-semibold text-sm truncate", currentSessionId === session.id ? "text-foreground" : "text-muted-foreground")}>
                         {session.title || '未命名会话'}
                       </span>
                       {session.updatedAt && (
                         <span className="text-[10px] text-muted-foreground/60 shrink-0">
                           {formatSessionTime(session.updatedAt)}
                         </span>
                       )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.lastMessage?.content || session.description || '无预览'}
                    </p>
                  </div>
                )}

                {!collapsed && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded-full transition-opacity absolute right-2 top-1/2 -translate-y-1/2 focus:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={(e) => handleArchiveSession(e, session.id)}>
                          <Archive className="w-4 h-4 mr-2" />
                          归档
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteSession(e, session.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 5. User Profile (Bottom) */}
      <div className="p-3 border-t border-border mt-auto shrink-0">
         <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all',
                  collapsed 
                    ? 'justify-center px-2' 
                    : 'border border-transparent hover:bg-accent hover:border-border'
                )}
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">
                    {user?.username?.slice(0, 1).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                
                {!collapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate">{user?.username || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || 'user@example.com'}</p>
                  </div>
                )}
                
                {!collapsed && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" side="right" align="end">
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-start font-bold" onClick={() => router.push('/settings')}>
                   <Settings className="w-4 h-4 mr-2" />
                   偏好设置
                </Button>
                <Button variant="ghost" className="w-full justify-start font-bold" onClick={() => router.push('/profile')}>
                   <User className="w-4 h-4 mr-2" />
                   个人资料
                </Button>
                <DropdownMenuSeparator />
                <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive font-bold" onClick={logout}>
                   <LogOut className="w-4 h-4 mr-2" />
                   退出登录
                </Button>
              </div>
            </PopoverContent>
         </Popover>

         {/* Collapse Toggle */}
         <button
            onClick={toggleCollapsed}
            className="w-full mt-2 flex justify-center py-2 text-muted-foreground hover:text-foreground transition-colors"
         >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
         </button>
      </div>
    </aside>
  );
}

