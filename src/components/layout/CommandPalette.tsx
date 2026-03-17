'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MessageSquare, Settings, User, ArrowRight, MessagesSquare } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSessions } from '@/hooks/use-sessions';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'session' | 'page' | 'message';
  title: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
}

interface MessageSearchResult {
  id: string;
  sessionId: string;
  sessionTitle: string;
  senderType: string;
  content: string;
  createdAt: string;
}

const staticPages: SearchResult[] = [
  { id: 'dashboard', type: 'page', title: '仪表盘', description: '查看概览和统计', icon: <ArrowRight className="w-4 h-4" />, href: '/' },
  { id: 'settings', type: 'page', title: '偏好设置', description: '外观和通知', icon: <Settings className="w-4 h-4" />, href: '/settings' },
  { id: 'profile', type: 'page', title: '个人资料', description: '头像、昵称和密码', icon: <User className="w-4 h-4" />, href: '/profile' },
];

const typeLabels: Record<string, string> = {
  session: '会话',
  page: '页面',
  message: '消息',
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();
  const { sessions } = useSessions();

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items: SearchResult[] = [];

    const matchedPages = staticPages.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q))
    );
    items.push(...matchedPages);

    const matchedSessions = sessions
      .filter(s =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map(s => ({
        id: s.id,
        type: 'session' as const,
        title: s.title || '未命名会话',
        description: s.lastMessage?.content?.slice(0, 60) || s.description || undefined,
        icon: <MessageSquare className="w-4 h-4" />,
        href: `/chat?sessionId=${s.id}`,
      }));
    items.push(...matchedSessions);

    // Append message search results
    const matchedMessages = messageResults.map(m => ({
      id: `msg-${m.id}`,
      type: 'message' as const,
      title: m.sessionTitle,
      description: m.content,
      icon: <MessagesSquare className="w-4 h-4" />,
      href: `/chat?sessionId=${m.sessionId}`,
    }));
    items.push(...matchedMessages);

    return items;
  }, [query, sessions, messageResults]);

  // Debounced message search
  const searchMessages = useCallback(async (q: string) => {
    if (q.length < 2) {
      setMessageResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setMessageResults(json.data?.messages || []);
      }
    } catch {
      // silent
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);

    // Debounce message search
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void searchMessages(value.trim());
    }, 300);
  }, [searchMessages]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setQuery('');
      setSelectedIndex(0);
      setMessageResults([]);
    }
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const navigate = useCallback((result: SearchResult) => {
    onOpenChange(false);
    router.push(result.href);
  }, [router, onOpenChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex]);
    }
  }, [results, selectedIndex, navigate]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">搜索</DialogTitle>
        <div className="flex items-center border-b border-border px-3">
          <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索会话、消息、页面..."
            className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm"
          />
          {isSearching && (
            <span className="text-xs text-muted-foreground shrink-0 animate-pulse">搜索中...</span>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1">
          {results.length === 0 && !isSearching && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              无匹配结果
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={result.id}
              onClick={() => navigate(result)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                i === selectedIndex
                  ? 'bg-red-500/15 text-foreground'
                  : 'hover:bg-red-500/8 text-muted-foreground'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                i === selectedIndex ? 'bg-red-500/20 text-red-400' : 'bg-muted text-muted-foreground'
              )}>
                {result.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium truncate',
                  i === selectedIndex ? 'text-foreground' : 'text-foreground/80'
                )}>
                  {result.title}
                </p>
                {result.description && (
                  <p className={cn(
                    'text-xs truncate',
                    i === selectedIndex ? 'text-foreground/70' : 'text-muted-foreground'
                  )}>
                    {result.description}
                  </p>
                )}
              </div>
              <span className={cn(
                'text-[10px] uppercase shrink-0',
                i === selectedIndex ? 'text-red-400/80' : 'text-muted-foreground/60'
              )}>
                {typeLabels[result.type] || result.type}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}
