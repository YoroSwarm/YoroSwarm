'use client';

import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useEffect } from 'react';
import { useThemeStore, useUIStore } from '@/stores';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const initTheme = useThemeStore((state) => state.initTheme);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <div className="flex h-screen bg-background">
      {/* 侧边栏容器 - 带宽度动画 */}
      <div
        className={`
          shrink-0 overflow-hidden transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-72 opacity-100' : 'w-0 opacity-0'}
        `}
      >
        <Sidebar />
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          showToggleButton={!sidebarOpen} 
          onToggleSidebar={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
