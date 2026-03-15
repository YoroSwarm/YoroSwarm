import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMCallOptions,
  LLMResponse,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
  StopReason,
} from './types'

let client: Anthropic | null = null

function getClient(apiKey: string, baseUrl?: string): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })
  }
  return client
}

export async function callAnthropic(options: LLMCallOptions): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const anthropic = getClient(apiKey, process.env.ANTHROPIC_BASE_URL)
  const model = options.model || process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-20250514'
  const maxTokens = options.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)
  const temperature = options.temperature ?? parseFloat(process.env.LLM_TEMPERATURE || '0.7')

  const messages = convertToAnthropicMessages(options.messages)
  const tools = options.tools ? convertToAnthropicTools(options.tools) : undefined

  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: options.systemPrompt,
    messages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools
  }

  const response = await anthropic.messages.create(params)
  return convertFromAnthropicResponse(response)
}

// ============================================
// Converters
// ============================================

function convertToAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    // Convert ContentBlock[] to Anthropic content blocks
    const blocks: Anthropic.ContentBlockParam[] = msg.content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text }
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          }
        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          }
      }
    })

    return { role: msg.role, content: blocks }
  })
}

function convertToAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  }))
}

function convertFromAnthropicResponse(response: Anthropic.Message): LLMResponse {
  const content: ContentBlock[] = response.content.map(block => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text }
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }
    }
    // Fallback
    return { type: 'text' as const, text: JSON.stringify(block) }
  })

  let stopReason: StopReason = 'end_turn'
  if (response.stop_reason === 'tool_use') stopReason = 'tool_use'
  else if (response.stop_reason === 'max_tokens') stopReason = 'max_tokens'

  return {
    content,
    stopReason,
    model: response.model,
    provider: 'anthropic',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
      cacheReadTokens: response.usage.cache_read_input_tokens || 0,
    },
  }
}
