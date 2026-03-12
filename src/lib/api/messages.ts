import { api } from './client';

// 消息类型
export type MessageType = 'text' | 'task_update' | 'agent_status' | 'system' | 'file' | 'broadcast';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type ConversationType = 'direct' | 'group' | 'broadcast';

// 创建消息请求
export interface CreateMessageRequest {
  content: string;
  type?: MessageType;
  recipient_id?: string;
  conversation_id?: string;
  metadata?: Record<string, unknown>;
}

export interface FileMessageMetadata {
  fileId?: string;
  fileName?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  url?: string;
}

// 创建广播消息请求
export interface CreateBroadcastRequest {
  content: string;
  type?: MessageType;
  metadata?: Record<string, unknown>;
  target_team?: string;
}

// 创建会话请求
export interface CreateConversationRequest {
  type?: ConversationType;
  title?: string;
  participant_ids: string[];
  metadata?: Record<string, unknown>;
  target_agent_id?: string;
  target_agent_name?: string;
}

// 消息响应
export interface MessageResponse {
  id: string;
  content: string;
  type: MessageType;
  sender_id: string;
  recipient_id?: string;
  conversation_id?: string;
  status: MessageStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  read_at?: string;
}

// 消息列表响应
export interface MessageListResponse {
  items: MessageResponse[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// 会话参与者响应
export interface ConversationParticipantResponse {
  user_id: string;
  joined_at: string;
  last_read_at?: string;
  is_admin: boolean;
}

// 会话响应
export interface ConversationResponse {
  id: string;
  type: ConversationType;
  title?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  participants: ConversationParticipantResponse[];
  participant_count: number;
  last_message?: MessageResponse;
}

// 会话列表响应
export interface ConversationListResponse {
  items: ConversationResponse[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// 未读计数响应
export interface UnreadCountResponse {
  total_unread: number;
  conversation_unread: Record<string, number>;
}

// 查询参数
export interface MessageQueryParams {
  conversation_id?: string;
  sender_id?: string;
  recipient_id?: string;
  message_type?: MessageType;
  page?: number;
  page_size?: number;
  before?: string;
  after?: string;
}

export interface ConversationQueryParams {
  type?: ConversationType;
  page?: number;
  page_size?: number;
  include_inactive?: boolean;
}

/**
 * Messages API封装
 */
export const messagesApi = {
  // ==================== 消息管理 ====================

  /**
   * 发送消息
   */
  sendMessage: async (data: CreateMessageRequest): Promise<MessageResponse> => {
    return api.post<MessageResponse>('/messages', data);
  },

  /**
   * 获取消息列表
   */
  getMessages: async (params?: MessageQueryParams): Promise<MessageListResponse> => {
    return api.get<MessageListResponse>('/messages', { params });
  },

  /**
   * 获取会话的消息列表
   */
  getConversationMessages: async (
    conversationId: string,
    params?: { page?: number; page_size?: number; before?: string }
  ): Promise<MessageListResponse> => {
    return api.get<MessageListResponse>(`/messages/conversations/${conversationId}/messages`, {
      params,
    });
  },

  /**
   * 标记消息为已读
   */
  markAsRead: async (messageId: string): Promise<MessageResponse> => {
    return api.put<MessageResponse>(`/messages/${messageId}/read`);
  },

  /**
   * 标记会话所有消息为已读
   */
  markConversationAsRead: async (conversationId: string): Promise<{ marked_as_read: number }> => {
    return api.put(`/messages/conversations/${conversationId}/read`);
  },

  /**
   * 发送广播消息
   */
  sendBroadcast: async (data: CreateBroadcastRequest): Promise<MessageResponse> => {
    return api.post<MessageResponse>('/messages/broadcast', data);
  },

  /**
   * 获取广播消息列表
   */
  getBroadcastMessages: async (params?: { page?: number; page_size?: number; after?: string }): Promise<MessageListResponse> => {
    return api.get<MessageListResponse>('/messages/broadcast', { params });
  },

  /**
   * 获取未读消息计数
   */
  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    return api.get<UnreadCountResponse>('/messages/unread/count');
  },

  // ==================== 会话管理 ====================

  /**
   * 创建会话
   */
  createConversation: async (data: CreateConversationRequest): Promise<ConversationResponse> => {
    return api.post<ConversationResponse>('/messages/conversations', data);
  },

  /**
   * 获取会话列表
   */
  getConversations: async (params?: ConversationQueryParams): Promise<ConversationListResponse> => {
    return api.get<ConversationListResponse>('/messages/conversations', { params });
  },

  /**
   * 获取单个会话详情
   */
  getConversation: async (conversationId: string): Promise<ConversationResponse> => {
    return api.get<ConversationResponse>(`/messages/conversations/${conversationId}`);
  },

  /**
   * 添加参与者到会话
   */
  addParticipant: async (conversationId: string, userId: string): Promise<{ message: string }> => {
    return api.post(`/messages/conversations/${conversationId}/participants/${userId}`);
  },

  /**
   * 从会话中移除参与者
   */
  removeParticipant: async (conversationId: string, userId: string): Promise<{ message: string }> => {
    return api.delete(`/messages/conversations/${conversationId}/participants/${userId}`);
  },
};
