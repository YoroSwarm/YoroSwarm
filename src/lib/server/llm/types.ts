/**
 * Provider-agnostic LLM types
 * Used throughout the system — providers adapt to/from these types
 */

// ============================================
// Message Types
// ============================================

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// ============================================
// Tool Definitions
// ============================================

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// ============================================
// Request / Response
// ============================================

export interface LLMCallOptions {
  systemPrompt: string
  messages: LLMMessage[]
  tools?: ToolDefinition[]
  model?: string
  maxTokens?: number
  temperature?: number
  usageContext?: {
    swarmSessionId?: string
    agentId?: string
    requestKind?: string
  }
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'tool_exit'

export interface LLMResponse {
  content: ContentBlock[]
  stopReason: StopReason
  model: string
  provider: LLMProvider
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
}

export interface AgentLoopResult {
  finalText: string
  toolCallsMade: number
  iterationsUsed: number
  contextEntriesAdded: string[]
  thinkingContent?: string[]
  toolCalls?: PersistedToolCallRecord[]
}

/**
 * 持久化到数据库的工具调用记录格式
 * 与前端 ToolCallRecord 接口兼容
 */
export interface PersistedToolCallRecord {
  toolName: string
  status: 'calling' | 'completed' | 'error'
  inputSummary?: string
  resultSummary?: string
  timestamp: string
}

// ============================================
// Provider Configuration
// ============================================

export type LLMProvider = 'anthropic' | 'openai'

export interface LLMProviderConfig {
  provider: LLMProvider
  apiKey: string
  baseUrl?: string
  defaultModel: string
  maxContextTokens: number
  maxOutputTokens: number
  temperature: number
}
