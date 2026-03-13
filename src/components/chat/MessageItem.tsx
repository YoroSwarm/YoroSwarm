'use client';

import Image from 'next/image';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/utils/date';
import {
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  FileText,
  Code,
  Copy,
  Check as CheckIcon,
  MoreHorizontal,
  CornerUpLeft,
  Download,
  Brain,
  ChevronDown,
  ChevronUp,
  Wrench,
  X,
  Loader2,
} from 'lucide-react';
import type { Message } from '@/types/chat';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
  isConsecutive: boolean;
  showTime?: boolean;
}

export function MessageItem({
  message,
  showAvatar,
  isConsecutive,
  showTime = true,
}: MessageItemProps) {
  const isUser = message.sender.type === 'user';
  const isSystem = message.sender.type === 'system';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const primaryAttachment = message.attachments?.[0];
  const attachmentUrl = primaryAttachment?.url || message.content;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatus = () => {
    switch (message.status) {
      case 'sending':
        return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />;
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'received':
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const renderContent = () => {
    switch (message.type) {
      case 'code':
        return (
          <div className="relative group/code">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/80 rounded-t-lg border-b border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Code className="h-3.5 w-3.5" />
                <span className="capitalize">
                  {message.metadata?.codeLanguage || 'code'}
                </span>
              </div>
              <button
                onClick={() => handleCopy(message.content)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-3 w-3" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    复制
                  </>
                )}
              </button>
            </div>
            <div className="overflow-x-auto">
              <SyntaxHighlighter
                language={message.metadata?.codeLanguage || 'typescript'}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0 0 0.5rem 0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                {message.content}
              </SyntaxHighlighter>
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="relative group/image">
            <Image
              src={attachmentUrl}
              alt="图片消息"
              width={800}
              height={600}
              className="max-w-full max-h-80 rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => window.open(attachmentUrl, '_blank')}
            />
          </div>
        );

      case 'file': {
        const fileUrl = primaryAttachment?.url || message.metadata?.url;
        const fileName = primaryAttachment?.name || message.metadata?.fileName || '文件';
        const fileSize = primaryAttachment?.size || message.metadata?.size;
        const fileMimeType = (message.metadata?.mimeType as string) || '';
        const isImage = fileMimeType.startsWith('image/');

        if (isImage && fileUrl) {
          return (
            <div className="relative group/image">
              <img
                src={fileUrl as string}
                alt={fileName as string}
                className="max-w-full max-h-80 rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => window.open(fileUrl as string, '_blank')}
              />
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{fileName as string}</span>
                {fileSize && <span>({formatFileSize(fileSize as number)})</span>}
              </div>
            </div>
          );
        }

        return (
          <div className={cn("flex items-center gap-3 p-3 rounded-lg max-w-sm", isUser ? "bg-primary/20" : "bg-muted")}>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded", isUser ? "bg-primary/20" : "bg-primary/10")}>
              <FileText className={cn("h-5 w-5", isUser ? "text-primary-foreground" : "text-primary")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", isUser ? "text-primary-foreground" : "text-foreground")}>{fileName as string}</p>
              <p className={cn("text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {fileSize ? formatFileSize(fileSize as number) : '未知大小'}
              </p>
            </div>
            {fileUrl && (
              <a
                href={`${fileUrl}?download=1`}
                download={fileName as string}
                className={cn("p-2 rounded transition-colors", isUser ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:bg-accent")}
                title="下载文件"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        );
      }

      case 'system':
        return (
          <div className="flex items-center justify-center py-2">
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {message.content}
            </span>
          </div>
        );

      default:
        return (
          <div className="text-sm leading-relaxed max-w-full overflow-hidden wrap-break-word">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="overflow-x-auto rounded-lg my-2 border border-border/50">
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          fontSize: '0.875rem',
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code className={cn("bg-muted px-1 py-0.5 rounded font-mono text-xs", className)} {...props}>
                      {children}
                    </code>
                  );
                },
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        );
    }
  };

  if (isSystem) {
    return (
      <div className="flex items-center justify-center py-2 animate-fade-in">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex gap-3 animate-slide-up',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isConsecutive && 'mt-1'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showAvatar ? (
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {message.sender.avatar ? (
            <Image
              src={message.sender.avatar}
              alt={message.sender.name}
              width={32}
              height={32}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            message.sender.name.charAt(0).toUpperCase()
          )}
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div
        className={cn(
          'flex max-w-[85%] md:max-w-[70%] flex-col',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {showAvatar && !isUser && (
          <span className="mb-1 text-xs text-muted-foreground">
            {message.sender.name}
          </span>
        )}

        <div
          className={cn(
            'relative px-4 py-2.5 border',
            isUser
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-foreground border-border',
            message.type === 'code' && 'p-0 overflow-hidden bg-muted border-border',
            message.type === 'image' && 'p-1 bg-card border-border',
            message.type === 'file' && 'p-2'
          )}
          style={{
            borderRadius: "12px",
          }}
        >
          {/* Thinking Process Section */}
          {((message.toolCalls && message.toolCalls.length > 0) || (message.thinkingContent && message.thinkingContent.length > 0)) && (
            <div className="mb-4 rounded-lg bg-muted/30 p-3 text-xs border border-border/40">
              <button
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                className="flex w-full items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
              >
                <Brain className="h-4 w-4 text-primary/70 group-hover:scale-110 transition-transform" />
                <span className="flex-1 text-left font-bold">
                  思考过程 ({message.toolCalls?.length || 0} 步骤)
                </span>
                <div className={`transition-transform duration-200 ${isThinkingExpanded ? 'rotate-180' : ''}`}>
                   {isThinkingExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isThinkingExpanded && (
                <div className="mt-3 space-y-3 pt-2 animate-fade-in">
                  {message.toolCalls?.map((tc: { toolName: string; status: 'calling' | 'completed' | 'error'; inputSummary?: string; resultSummary?: string }, i: number) => (
                    <div key={i} className="flex flex-col gap-1 p-2 bg-background/50 rounded border border-border/20">
                      <div className="flex items-center gap-2 font-medium">
                        {tc.status === 'calling' ? (
                          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        ) : tc.status === 'completed' ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <X className="h-3 w-3 text-destructive" />
                        )}
                        <span className="text-foreground">{tc.toolName}</span>
                      </div>
                      {tc.inputSummary && (
                        <div className="pl-5 text-muted-foreground wrap-break-word font-mono text-[10px]">
                          输入: {tc.inputSummary}
                        </div>
                      )}
                      {tc.resultSummary && (
                        <div className="pl-5 text-muted-foreground wrap-break-word font-mono text-[10px] border-l-2 border-primary/20">
                          输出: {tc.resultSummary}
                        </div>
                      )}
                    </div>
                  ))}

                  {message.thinkingContent?.map((text: string, i: number) => (
                    <div key={i} className="pl-2 border-l-2 border-primary/20 text-muted-foreground italic leading-relaxed">
                      {text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {renderContent()}
        </div>

        {(showTime || isUser) && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 text-xs text-muted-foreground',
              isUser ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            {showTime && <span>{formatMessageTime(message.createdAt)}</span>}
            {isUser && renderStatus()}
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex items-center gap-1 opacity-0 transition-opacity',
          showActions && 'opacity-100'
        )}
      >
        <button
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          title="回复"
        >
          <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          title="更多"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
