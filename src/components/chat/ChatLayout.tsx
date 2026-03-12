'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SessionList } from './SessionList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useSessions } from '@/hooks/use-sessions';
import { PanelRightClose, PanelRightOpen, Menu, X } from 'lucide-react';

interface ChatLayoutProps {
  className?: string;
}

/**
 * 聊天界面三栏布局组件
 * 左侧：会话列表 | 中间：聊天区域 | 右侧：详情/工具面板
 */
export function ChatLayout({ className }: ChatLayoutProps) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const { sessions } = useSessions();

  // 获取当前会话标题
  const currentSessionTitle = useMemo(() => {
    if (!currentSessionId) return null;
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.title || '未命名会话';
  }, [currentSessionId, sessions]);

  return (
    <div className={cn('flex h-screen w-full bg-background', className)}>
      {/* 移动端遮罩 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 左侧：会话列表 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 transform border-r border-border bg-card transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SessionList
          currentSessionId={currentSessionId}
          onSessionSelect={(id) => {
            setCurrentSessionId(id);
            setIsMobileMenuOpen(false);
          }}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
      </aside>

      {/* 中间：聊天区域 */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* 顶部导航栏 */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-accent lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-semibold text-lg truncate">
              {currentSessionTitle || '选择或创建一个会话'}
            </h1>
          </div>

          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className="p-2 rounded-md hover:bg-accent hidden md:flex"
            title={isRightPanelOpen ? '关闭右侧面板' : '打开右侧面板'}
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </button>
        </header>

        {/* 消息列表区域 */}
        <div className="flex-1 overflow-hidden">
          {currentSessionId ? (
            <MessageList sessionId={currentSessionId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <div className="mb-4 text-6xl">💬</div>
              <p className="text-lg">选择一个会话开始聊天</p>
              <p className="text-sm mt-2">或创建一个新的会话</p>
            </div>
          )}
        </div>

        {/* 底部输入框 */}
        <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
          <ChatInput
            sessionId={currentSessionId}
            disabled={!currentSessionId}
            placeholder={currentSessionId ? '输入消息...' : '请先选择一个会话'}
          />
        </div>
      </main>

      {/* 右侧：详情/工具面板 */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-30 w-80 transform border-l border-border bg-card transition-transform duration-300 ease-in-out md:static',
          isRightPanelOpen ? 'translate-x-0' : 'translate-x-full md:w-0 md:overflow-hidden md:border-l-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
            <h2 className="font-semibold">详情</h2>
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="p-2 rounded-md hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {currentSessionId ? (
              <div className="space-y-6">
                {/* 会话信息 */}
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">会话信息</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">会话ID</span>
                      <span className="font-mono text-xs">{currentSessionId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">状态</span>
                      <span>活跃</span>
                    </div>
                  </div>
                </section>

                {/* 参与者 */}
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">参与者</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        我
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">当前用户</p>
                        <p className="text-xs text-muted-foreground">在线</p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                选择一个会话查看详情
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
