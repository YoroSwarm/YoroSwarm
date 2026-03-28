"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CommandPalette, useCommandPalette } from "@/components/layout/CommandPalette";
import { useUIStore } from "@/stores";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Loader2 } from "lucide-react";

function ChatContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get('sessionId');

  // 始终渲染 ChatLayout，但只在使用 /chat 路由时显示
  // 这样 ChatLayout 保持挂载状态，不会断开 WebSocket
  const isChatRoute = pathname.startsWith('/chat');

  // 使用 absolute 定位确保隐藏时不占用布局空间
  // 使用 hidden 来完全移除元素，而不是 opacity-0
  return (
    <div
      className={`
        absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-200
        ${isChatRoute ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}
      `}
    >
      <ChatLayout initialSessionId={initialSessionId} />
    </div>
  );
}

function ChatContentLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandPalette();
  const pathname = usePathname();
  const isChatRoute = pathname.startsWith('/chat');

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
        {/* main 和 ChatContent 在同一个 flex 容器中，ChatContent 使用 absolute 定位只覆盖 main 区域 */}
        <div className="flex-1 relative overflow-hidden">
          <main className="absolute inset-0 overflow-y-auto">
            {/* 非 chat 路由显示 children */}
            {!isChatRoute && children}
          </main>
          {/* ChatLayout 始终渲染但使用 absolute 定位，只覆盖 main 区域 */}
          <Suspense fallback={<ChatContentLoader />}>
            <ChatContent />
          </Suspense>
        </div>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
