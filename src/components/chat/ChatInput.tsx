'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/use-agents';
import {
  Send,
  Paperclip,
  AtSign,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { useLeadPreferencesStore } from '@/stores/leadPreferencesStore';
import type { MentionSuggestion } from '@/types/chat';

interface ChatInputProps {
  sessionId: string | null;
  disabled?: boolean;
  placeholder?: string;
  onSend?: (content: string, attachments?: File[]) => Promise<void> | void;
}

export function ChatInput({
  sessionId,
  disabled = false,
  placeholder = '输入消息...',
  onSend,
}: ChatInputProps) {
  const { glassEffect } = useLeadPreferencesStore();
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionStartRef = useRef<number>(-1);
  const sendingRef = useRef(false);
  const dragCounterRef = useRef(0);

  const { agents } = useAgents({
    swarmSessionId: sessionId || undefined,
    autoLoad: Boolean(sessionId),
  });

  const mentionSuggestions: MentionSuggestion[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.description || agent.type,
  }));

  const filteredMentions = mentionQuery
    ? mentionSuggestions.filter(
        (agent) =>
          agent.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          agent.role.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : mentionSuggestions;

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    adjustTextareaHeight();

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (
      lastAtIndex !== -1 &&
      (lastAtIndex === 0 || value[lastAtIndex - 1] === ' ') &&
      !textBeforeCursor.slice(lastAtIndex).includes(' ')
    ) {
      mentionStartRef.current = lastAtIndex;
      setMentionQuery(textBeforeCursor.slice(lastAtIndex + 1));
      setShowMentions(true);
      setSelectedMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedMentionIndex((prev) =>
            Math.min(prev + 1, filteredMentions.length - 1)
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        case 'Enter':
          e.preventDefault();
          if (filteredMentions[selectedMentionIndex]) {
            insertMention(filteredMentions[selectedMentionIndex]);
          }
          return;
        case 'Escape':
          setShowMentions(false);
          return;
      }
    }

    if (e.key === 'Enter' && e.shiftKey) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertMention = (agent: MentionSuggestion) => {
    if (mentionStartRef.current === -1) return;

    const beforeMention = content.slice(0, mentionStartRef.current);
    const afterMention = content.slice(
      textareaRef.current?.selectionStart || mentionStartRef.current
    );
    const newContent = `${beforeMention}@${agent.name} ${afterMention}`;

    setContent(newContent);
    setShowMentions(false);
    setMentionQuery('');
    mentionStartRef.current = -1;

    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + agent.name.length + 2;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleSend = async () => {
    if ((!content.trim() && attachments.length === 0) || disabled || isSending || sendingRef.current) return;

    try {
      sendingRef.current = true;
      setIsSending(true);
      await onSend?.(content.trim(), attachments.length > 0 ? attachments : undefined);

      setContent('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSending(false);
      sendingRef.current = false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachments((prev) => [...prev, ...files]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setAttachments((prev) => [...prev, ...files]);
    }
  }, []);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border border-primary/50 bg-primary/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Paperclip className="h-8 w-8" />
            <span className="text-sm font-medium">拖放文件到这里</span>
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm animate-fade-in"
            >
              {file.type.startsWith('image/') ? (
                <div className="relative h-10 w-10 rounded overflow-hidden shrink-0">
                  <Image
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ) : (
                getFileIcon(file)
              )}
              <span className="max-w-37.5 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                onClick={() => removeAttachment(index)}
                className="p-0.5 rounded hover:bg-accent active:bg-accent/80 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'chat-glass-surface relative flex items-center gap-2 rounded-2xl border bg-background p-2 shadow-sm transition-all',
          glassEffect && 'backdrop-blur',
          isFocused && 'border-primary ring-2 ring-primary/20',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/80 disabled:opacity-50"
          title="上传文件"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled}
          aria-label="上传文件"
        />

        <div className="relative flex-1 min-w-0 flex items-center">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="w-full resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed max-h-50 leading-normal"
            style={{ minHeight: '24px' }}
          />

          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-[calc(100vw-2rem)] sm:w-64 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg animate-fade-in">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                选择Agent ({filteredMentions.length})
              </div>
              {filteredMentions.map((agent, index) => (
                <button
                  key={agent.id}
                  onClick={() => insertMention(agent)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50 active:bg-accent/70',
                    index === selectedMentionIndex && 'bg-accent/50'
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
                    {agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {agent.role}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setContent((prev) => prev + '@');
            textareaRef.current?.focus();
          }}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/80 disabled:opacity-50"
          title="@提及"
        >
          <AtSign className="h-5 w-5" />
        </button>

        <button
          onClick={handleSend}
          disabled={disabled || isSending || (!content.trim() && attachments.length === 0)}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
            content.trim() || attachments.length > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground'
          )}
          title="发送"
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className={cn(
        "flex items-center justify-between text-xs text-muted-foreground px-1 overflow-hidden transition-all duration-300",
        isFocused ? "mt-2 opacity-100 max-h-5" : "mt-0 opacity-0 max-h-0"
      )}>
        <span>Shift + Enter 换行</span>
        <span>@ 提及Agent</span>
      </div>
    </div>
  );
}
