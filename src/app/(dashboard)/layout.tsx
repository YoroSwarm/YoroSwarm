"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useUIStore } from "@/stores";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

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
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
