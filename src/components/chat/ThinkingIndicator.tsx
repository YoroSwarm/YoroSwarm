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
    <div className="flex gap-3 animate-slide-up font-body">
      <div 
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-secondary text-secondary-foreground text-xs font-bold border border-border rounded-full"
      >
        {agentName.charAt(0).toUpperCase()}
      </div>

      <div className={cn('flex max-w-[80%] flex-col items-start')}>
        <span className="mb-1 text-xs text-muted-foreground font-bold">{agentName}</span>

        <div 
          className="bg-muted px-4 py-3 text-foreground w-full border border-border rounded-xl"
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full group"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary group-hover:rotate-12 transition-transform" />
            ) : (
              <Brain className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            )}
            <span className="flex-1 text-left font-bold">
              {isThinking ? `${agentName} 正在思考...` : `${agentName} 的思考过程`}
            </span>
            {(thinkingContent.length > 0 || toolCalls.length > 0) && (
              <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                 {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            )}
          </button>

          {isThinking && toolCalls.length === 0 && thinkingContent.length === 0 && (
            <div className="flex items-center gap-1 mt-2 pl-6">
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          {toolCalls.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border/20 pt-2">
              {toolCalls.map((tc, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-medium">
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
                    {tc.inputSummary && <span className="ml-1 opacity-70 italic">({tc.inputSummary})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isExpanded && thinkingContent.length > 0 && (
            <div className="mt-3 border-t border-border/20 pt-3">
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1 max-h-48 overflow-y-auto font-medium">
                {thinkingContent.map((text, i) => (
                  <p key={i} className="pl-2 border-l-2 border-primary/20">{text}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
