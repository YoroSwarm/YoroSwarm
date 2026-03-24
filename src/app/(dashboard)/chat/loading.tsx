'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    </div>
  );
}
