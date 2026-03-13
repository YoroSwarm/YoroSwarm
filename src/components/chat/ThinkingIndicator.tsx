'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Brain, ChevronDown, ChevronUp, Wrench, Check, X, Loader2 } from 'lucide-react';
import type { ToolCallState } from '@/hooks/use-messages';

interface ThinkingIndicatorProps {
  agentName: string;
  isThinking: boolean;
  thinkingContent: string[];
  toolCalls: ToolCallState[];
}

export function ThinkingIndicator({ agentName, isThinking, thinkingContent, toolCalls }: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isThinking && toolCalls.length === 0 && thinkingContent.length === 0) return null;

  return (
    <div className="flex gap-3 animate-slide-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
        {agentName.charAt(0).toUpperCase()}
      </div>

      <div className={cn('flex max-w-[80%] flex-col items-start')}>
        <span className="mb-1 text-xs text-muted-foreground">{agentName}</span>

        <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-foreground w-full">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Brain className="h-4 w-4 text-primary" />
            )}
            <span className="flex-1 text-left font-medium">
              {isThinking ? `${agentName} 正在思考...` : `${agentName} 的思考过程`}
            </span>
            {(thinkingContent.length > 0 || toolCalls.length > 0) && (
              isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {isThinking && toolCalls.length === 0 && thinkingContent.length === 0 && (
            <div className="flex items-center gap-1 mt-2">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          {toolCalls.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {toolCalls.map((tc, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {tc.status === 'calling' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                  ) : tc.status === 'completed' ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <X className="h-3 w-3 text-destructive" />
                  )}
                  <Wrench className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {tc.toolName}
                    {tc.inputSummary && <span className="ml-1 opacity-70">({tc.inputSummary})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isExpanded && thinkingContent.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1 max-h-48 overflow-y-auto">
                {thinkingContent.map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
