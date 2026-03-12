'use client';

import Image from 'next/image';
import { useState } from 'react';
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
} from 'lucide-react';
import type { Message } from '@/types/chat';

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
  isConsecutive: boolean;
}

export function MessageItem({
  message,
  showAvatar,
  isConsecutive,
}: MessageItemProps) {
  const isUser = message.sender.type === 'user';
  const isSystem = message.sender.type === 'system';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

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
        );

      case 'image':
        return (
          <div className="relative group/image">
            <Image
              src={message.content}
              alt="图片消息"
              width={800}
              height={600}
              className="max-w-full max-h-80 rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => window.open(message.content, '_blank')}
            />
          </div>
        );

      case 'file':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg max-w-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {message.attachments?.[0]?.name || '文件'}
              </p>
              <p className="text-xs text-muted-foreground">
                {message.attachments?.[0]?.size
                  ? `${(message.attachments[0].size / 1024).toFixed(1)} KB`
                  : '未知大小'}
              </p>
            </div>
            <a
              href={message.content}
              download
              className="p-2 rounded hover:bg-accent transition-colors"
            >
              <Copy className="h-4 w-4" />
            </a>
          </div>
        );

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
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'h-4' : ''}>
                {line}
              </p>
            ))}
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
          'flex max-w-[80%] flex-col',
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
            'relative rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted text-foreground rounded-bl-md',
            message.type === 'code' && 'p-0 overflow-hidden bg-muted',
            message.type === 'image' && 'p-1 bg-muted',
            message.type === 'file' && 'p-2 bg-muted'
          )}
        >
          {renderContent()}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 text-xs text-muted-foreground',
            isUser ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span>{formatMessageTime(message.createdAt)}</span>
          {isUser && renderStatus()}
        </div>
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
