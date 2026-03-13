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
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens'

export interface LLMResponse {
  content: ContentBlock[]
  stopReason: StopReason
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface AgentLoopResult {
  finalText: string
  toolCallsMade: number
  iterationsUsed: number
  contextEntriesAdded: string[]
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

