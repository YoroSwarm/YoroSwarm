'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ThinkingIndicatorProps {
  agentName: string;
  agentId?: string;
  role?: 'lead' | 'teammate';
  isThinking: boolean;
}

export function ThinkingIndicator({ agentName, role, isThinking }: ThinkingIndicatorProps) {
  if (!isThinking) return null;

  return (
    <div className="flex gap-3 animate-pulse py-1">
      <div className="w-8 shrink-0" />

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">
          <span className="font-medium text-foreground">{agentName}</span>
          {role && (
            <Badge variant={role === 'lead' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
              {role === 'lead' ? 'Lead' : 'Teammate'}
            </Badge>
          )}
          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
          <span>思考中...</span>
        </span>
      </div>
    </div>
  );
}
