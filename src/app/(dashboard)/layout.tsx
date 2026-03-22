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
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed overlay on mobile, inline on desktop */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out
          md:static md:z-auto md:transition-[margin] md:translate-x-0
          ${sidebarOpen ? 'translate-x-0 md:ml-0' : '-translate-x-full md:-ml-64'}
        `}
        style={{ width: '16rem' }}
      >
        <Sidebar />
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          showToggleButton={!sidebarOpen} 
          onToggleSidebar={() => setSidebarOpen(true)}
          onSearchClick={() => setSearchOpen(true)}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
