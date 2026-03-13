'use client';

import { Bell, Search, Sun, Moon, User } from 'lucide-react';
import { useThemeStore, useAuthStore } from '@/stores';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export function Header() {
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      {/* 搜索栏 */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索..."
            className="pl-10 pr-4 py-2 bg-muted text-sm"
          />
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-2">
        {/* 主题切换 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </Button>

        {/* 通知 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-2">
              <h3 className="font-medium text-foreground">通知</h3>
            </div>
            <Separator />
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              暂无新通知
            </div>
          </PopoverContent>
        </Popover>

        {/* 用户菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-lg hover:bg-accent transition-colors">
              <Avatar>
                {user?.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.username} />
                ) : null}
                <AvatarFallback className="bg-primary/10">
                  <User className="w-4 h-4 text-primary" />
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">
                  {user?.username || '用户'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user?.role === 'admin' ? '管理员' : '普通用户'}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">个人资料</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">设置</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
