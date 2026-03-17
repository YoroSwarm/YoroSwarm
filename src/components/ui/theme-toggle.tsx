'use client';

import * as React from 'react';
import { useThemeStore } from '@/stores/themeStore';
import type { Theme } from '@/types/index';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'button';
}

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const themeLabels = {
  light: '浅色模式',
  dark: '深色模式',
  system: '跟随系统',
};

export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const CurrentIcon = themeIcons[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          variant === 'icon'
            ? 'h-9 w-9 hover:bg-accent hover:text-accent-foreground'
            : 'h-10 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80',
          className
        )}
      >
        <CurrentIcon className="h-4.5 w-4.5" />
        <span className="sr-only">切换主题</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(themeLabels) as Theme[]).map((themeOption) => {
          const Icon = themeIcons[themeOption];
          return (
            <DropdownMenuItem
              key={themeOption}
              onClick={() => setTheme(themeOption)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4" />
              <span>{themeLabels[themeOption]}</span>
              {theme === themeOption && (
                <span className="ml-auto">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 简单的切换按钮组件
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'h-9 w-9 hover:bg-accent hover:text-accent-foreground',
        className
      )}
      aria-label="切换主题"
    >
      {theme === 'light' ? (
        <Sun className="h-4.5 w-4.5" />
      ) : theme === 'dark' ? (
        <Moon className="h-4.5 w-4.5" />
      ) : (
        <Monitor className="h-4.5 w-4.5" />
      )}
    </button>
  );
}

// 带有标签的主题切换器
export function ThemeToggleWithLabel({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          theme === 'light' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
        )}
      >
        <Sun className="h-4 w-4" />
        <span>浅色</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          theme === 'dark' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
        )}
      >
        <Moon className="h-4 w-4" />
        <span>深色</span>
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          theme === 'system' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
        )}
      >
        <Monitor className="h-4 w-4" />
        <span>系统</span>
      </button>
    </div>
  );
}
