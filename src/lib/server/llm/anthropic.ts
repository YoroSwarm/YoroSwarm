import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMCallOptions,
  LLMResponse,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
  StopReason,
} from './types'
import type { LLMProviderConfig } from './config'

// Cache clients by API key, base URL, and auth mode
const clientCache = new Map<string, Anthropic>()

function getClient(
  apiKey: string,
  baseUrl?: string,
  authMode?: 'bearer_token' | 'x_api_key',
  customHeaders?: Record<string, string>
): Anthropic {
  // Validate API key
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key is missing or empty')
  }

  // Use official SDK for everything - it supports custom headers via defaultHeaders
  const key = `${apiKey}:${baseUrl || 'default'}:${authMode || 'bearer_token'}:${JSON.stringify(customHeaders || {})}`
  if (!clientCache.has(key)) {
    // Normalize baseUrl - SDK expects base URL without /v1 suffix
    let normalizedBaseUrl = baseUrl
    if (normalizedBaseUrl && normalizedBaseUrl.endsWith('/v1')) {
      normalizedBaseUrl = normalizedBaseUrl.slice(0, -3)
    }

    console.log(`[Anthropic] Creating SDK client with baseUrl=${normalizedBaseUrl || 'default'}, authMode=${authMode || 'bearer_token'}, hasCustomHeaders=${!!customHeaders}`)

    const clientOptions: any = {
      apiKey,
      ...(normalizedBaseUrl ? { baseURL: normalizedBaseUrl } : {}),
    }

    // Build headers based on authMode and customHeaders
    const headers: Record<string, string> = {}

    // If custom headers are provided, use them
    if (customHeaders && Object.keys(customHeaders).length > 0) {
      Object.assign(headers, customHeaders)
    } else {
      // Otherwise use authMode to determine auth header
      const mode = authMode || 'bearer_token'
      if (mode === 'x_api_key') {
        headers['x-api-key'] = apiKey
      } else {
        // For bearer_token, SDK handles it automatically via apiKey parameter
        // Don't set Authorization header manually
      }
    }

    // Add headers to client options if we have any
    if (Object.keys(headers).length > 0) {
      clientOptions.defaultHeaders = headers
    }

    clientCache.set(key, new Anthropic(clientOptions))
  }
  return clientCache.get(key)!
}

export async function callAnthropic(options: LLMCallOptions, config: LLMProviderConfig): Promise<LLMResponse> {
  const client = getClient(config.apiKey, config.baseUrl, config.authMode, config.customHeaders)
  const model = options.model || config.defaultModel
  const maxTokens = options.maxTokens ?? config.maxOutputTokens
  const temperature = options.temperature ?? config.temperature

  // Build native Anthropic messages from LLMMessage format
  const messages: Anthropic.MessageParam[] = options.messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    // ContentBlock[] format - convert to Anthropic native format
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

  // Build native Anthropic tools from ToolDefinition format
  const tools = options.tools ? options.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  })) : undefined

  const params: any = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: options.systemPrompt,
    messages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools
  }

  const requestOptions: any = {}
  if (options.abortSignal) {
    requestOptions.signal = options.abortSignal
  }

  const response = await client.messages.create(params, requestOptions)
  return convertFromAnthropicResponse(response)
}

// ============================================
// Response Converter (SDK -> Internal Format)
// ============================================

function convertFromAnthropicResponse(response: Anthropic.Message): LLMResponse {
  const content: ContentBlock[] = []
  const thinkingParts: string[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      content.push({ type: 'text' as const, text: block.text })
    } else if (block.type === 'tool_use') {
      content.push({
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      })
    } else if (block.type === 'thinking') {
      // Capture thinking content instead of dropping it
      if (block.thinking) {
        thinkingParts.push(block.thinking)
      }
    } else {
      // Unknown block types — skip silently to avoid leaking internal data
      console.warn('Unknown Anthropic content block type:', (block as { type: string }).type)
    }
  }

  let stopReason: StopReason = 'end_turn'
  if (response.stop_reason === 'tool_use') stopReason = 'tool_use'
  else if (response.stop_reason === 'max_tokens') stopReason = 'max_tokens'

  return {
    content,
    stopReason,
    model: response.model,
    provider: 'anthropic',
    reasoningContent: thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
      cacheReadTokens: response.usage.cache_read_input_tokens || 0,
    },
  }
}
