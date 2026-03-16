'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ThinkingIndicatorProps {
  agentName: string;
  agentId?: string;
  role?: 'lead' | 'teammate';
  isThinking: boolean;
  thinkingContent?: string[];
}

export function ThinkingIndicator({ agentName, role, isThinking, thinkingContent }: ThinkingIndicatorProps) {
  if (!isThinking) return null;

  const latestThought = thinkingContent?.length ? thinkingContent[thinkingContent.length - 1] : null;

  return (
    <div className="flex gap-3 py-1">
      <div className="w-8 shrink-0" />

      <div className="flex flex-col gap-1 max-w-md">
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

        {latestThought && (
          <div className="bg-muted/30 rounded-lg p-2 text-xs text-muted-foreground border border-border/30">
            <div className="pl-2 border-l-2 border-purple-500/30 italic line-clamp-3">
              {latestThought}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
