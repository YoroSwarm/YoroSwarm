'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Search, PanelLeft, Settings, User, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuthStore } from '@/stores';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';

interface HeaderProps {
  showToggleButton?: boolean;
  onToggleSidebar?: () => void;
  onSearchClick?: () => void;
}

export function Header({ showToggleButton, onToggleSidebar, onSearchClick }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const { glassEffect } = useLeadPreferencesStore();
  const router = useRouter();

  return (
    <header className={`h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-200${glassEffect ? ' backdrop-blur' : ''}`}>
      {/* 左侧展开按钮 */}
      {showToggleButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-9 w-9 mr-4 rounded-lg border border-border hover:bg-accent"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      )}

      {/* 搜索栏 */}
      <div className="flex-1 max-w-xl">
        <div className="relative cursor-pointer" onClick={onSearchClick}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索...  ⌘K"
            className="pl-10 pr-4 py-2 bg-muted text-sm pointer-events-none"
            readOnly
          />
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-2 ml-4">
        {/* 主题切换按钮 */}
        <ThemeToggle />

        {/* 用户头像 */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors">
              <Avatar className="h-8 w-8 border border-border">
                {user?.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.displayName || user.username} />
                ) : null}
                <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-sm">
                  {(user?.displayName || user?.username || 'U').slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">
                {user?.displayName || user?.username || 'User'}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className={cn("w-56 p-2", glassEffect && 'backdrop-blur')} align="end">
            <div className="px-3 py-2 mb-1">
              <p className="text-sm font-semibold">{user?.displayName || user?.username}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Separator className="my-1" />
            <div className="space-y-0.5">
              <Button variant="ghost" className="w-full justify-start font-medium text-sm h-9" onClick={() => router.push('/profile')}>
                <User className="w-4 h-4 mr-2" />
                个人资料
              </Button>
              <Button variant="ghost" className="w-full justify-start font-medium text-sm h-9" onClick={() => router.push('/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                偏好设置
              </Button>
              <Separator className="my-1" />
              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive font-medium text-sm h-9" onClick={logout}>
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
