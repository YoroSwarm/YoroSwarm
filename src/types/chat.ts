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
  relativePath?: string;
  url?: string;
  downloadUrl?: string;
  name: string;
  size?: number;
  mimeType?: string;
}

export interface ToolCall {
  toolName: string;
  status: 'calling' | 'completed' | 'error';
  inputSummary?: string;
  resultSummary?: string;
  timestamp: string;
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
    toolCalls?: ToolCall[];
    activityType?: 'thinking' | 'tool_call' | 'tool_result' | 'assistant_response' | 'bubble';
    isError?: boolean;
    toolName?: string;
    toolCallId?: string;
    hasResult?: boolean;
    orphaned?: boolean;
    seq?: number;
    model?: string;
  };
  toolCalls?: ToolCall[];
  thinkingContent?: string[];
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  workspaceId: string;
  participants: Agent[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  status: 'active' | 'archived' | 'deleted' | 'paused';
  isPinned?: boolean;
  tags?: string[];
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string;
  sessionCount: number;
  activeSessionCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
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
