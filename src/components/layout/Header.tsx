'use client';

import Image from 'next/image';
import { Bell, Search, Sun, Moon, User } from 'lucide-react';
import { useThemeStore, useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import Link from 'next/link';

export function Header() {
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      {/* 搜索栏 */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索..."
            className="w-full pl-10 pr-4 py-2 bg-muted rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-2">
        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className={cn(
            'p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors'
          )}
          title={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>

        {/* 通知 */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </button>

          {/* 通知下拉菜单 */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg py-2 animate-fade-in">
              <div className="px-4 py-2 border-b border-border">
                <h3 className="font-medium text-foreground">通知</h3>
              </div>
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                暂无新通知
              </div>
            </div>
          )}
        </div>

        {/* 用户菜单 */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.username}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-foreground">
                {user?.username || '用户'}
              </p>
              <p className="text-xs text-muted-foreground">
                {user?.role === 'admin' ? '管理员' : '普通用户'}
              </p>
            </div>
          </button>

          {/* 用户下拉菜单 */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 animate-fade-in">
              <Link
                href="/settings/profile"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
              >
                个人资料
              </Link>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
              >
                设置
              </Link>
              <div className="border-t border-border my-1" />
              <button className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10">
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
