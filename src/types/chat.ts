/**
 * 聊天相关类型定义
 */

export type MessageType = 'text' | 'code' | 'image' | 'file' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'error' | 'received';

export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  role: string;
  status: 'online' | 'offline' | 'busy' | 'idle' | 'error';
  color?: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

export interface Message {
  id: string;
  sessionId: string;
  type: MessageType;
  content: string;
  sender: {
    id: string;
    type: 'user' | 'agent' | 'system';
    name: string;
    avatar?: string;
  };
  status: MessageStatus;
  createdAt: string;
  updatedAt?: string;
  attachments?: MessageAttachment[];
  metadata?: {
    codeLanguage?: string;
    replyTo?: string;
    edited?: boolean;
    url?: string;
    fileName?: string;
    fileId?: string;
    mimeType?: string;
    size?: number;
    toolCalls?: any[];
    thinkingContent?: string[];
  };
  toolCalls?: any[];
  thinkingContent?: string[];
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  participants: Agent[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived' | 'deleted';
  tags?: string[];
}

export interface ChatState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Record<string, Message[]>;
  isLoading: boolean;
  error: string | null;
}

export interface TypingIndicator {
  sessionId: string;
  agentId: string;
  agentName: string;
  startedAt: string;
}

export interface MentionSuggestion {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}
