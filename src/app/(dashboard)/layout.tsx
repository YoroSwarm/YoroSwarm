"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CommandPalette, useCommandPalette } from "@/components/layout/CommandPalette";
import { useUIStore } from "@/stores";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandPalette();

  return (
    <div className="flex h-screen bg-background">
      {/* 侧边栏容器 - translateX 滑入/滑出 */}
      <div
        className={`
          shrink-0 overflow-hidden transition-[margin] duration-300 ease-in-out
          ${sidebarOpen ? 'ml-0' : '-ml-72'}
        `}
        style={{ width: '18rem' }}
      >
        <Sidebar />
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          showToggleButton={!sidebarOpen} 
          onToggleSidebar={() => setSidebarOpen(true)}
          onSearchClick={() => setSearchOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
