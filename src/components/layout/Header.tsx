'use client';

import { Bell, Search, PanelLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface HeaderProps {
  showToggleButton?: boolean;
  onToggleSidebar?: () => void;
}

export function Header({ showToggleButton, onToggleSidebar }: HeaderProps) {
  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
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

      </div>
    </header>
  );
}
