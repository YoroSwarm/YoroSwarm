'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Settings,
  FileText,
  Layers,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useSidebar } from '@/stores';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

const sidebarItems: SidebarItem[] = [
  {
    id: 'dashboard',
    label: '仪表盘',
    icon: <LayoutDashboard className="w-5 h-5" />,
    path: '/dashboard',
  },
  {
    id: 'chat',
    label: '会话',
    icon: <MessageSquare className="w-5 h-5" />,
    path: '/chat',
  },
  {
    id: 'tasks',
    label: '任务',
    icon: <CheckSquare className="w-5 h-5" />,
    path: '/tasks',
  },
  {
    id: 'files',
    label: '文件',
    icon: <FileText className="w-5 h-5" />,
    path: '/files',
  },
  {
    id: 'artifacts',
    label: '产出物',
    icon: <Layers className="w-5 h-5" />,
    path: '/artifacts',
  },
  {
    id: 'settings',
    label: '设置',
    icon: <Settings className="w-5 h-5" />,
    path: '/settings',
  },
];

export function Sidebar() {
  const { sidebarOpen: collapsed, toggleSidebar: toggleCollapsed } = useSidebar();
  const logout = useAuthStore((state) => state.logout);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="h-16 flex items-center justify-center border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-lg text-foreground">Swarm</span>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.id}
              href={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              {item.icon}
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border space-y-1">
        <button
          onClick={toggleCollapsed}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span>收起菜单</span>
            </>
          )}
        </button>

        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
            'text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  );
}
