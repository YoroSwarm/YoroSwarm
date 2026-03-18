import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import type {
  LLMCallOptions,
  LLMResponse,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
  StopReason,
} from './types'
import type { LLMProviderConfig } from './config'

// Cache clients by API key and base URL
const clientCache = new Map<string, Anthropic>()
const thirdPartyCache = new Map<string, ThirdPartyAnthropicClient>()

interface ThirdPartyClientConfig {
  apiKey: string
  baseUrl: string
}

class ThirdPartyAnthropicClient {
  private config: ThirdPartyClientConfig
  private axiosInstance: any

  constructor(config: ThirdPartyClientConfig) {
    this.config = config

    // Construct base URL
    let baseUrl = config.baseUrl
    if (!baseUrl.endsWith('/v1') && !baseUrl.endsWith('/anthropic') && !baseUrl.includes('/messages')) {
      baseUrl = baseUrl.endsWith('/') ? baseUrl + 'v1' : baseUrl + '/v1'
    }

    // Create axios instance with configuration
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'x-api-key': config.apiKey,
      },
      timeout: 120000, // 2 minutes
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (request: any) => {
        console.log(`[ThirdPartyAnthropic] ${request.method.toUpperCase()} ${request.baseURL}${request.url}`)
        // request.data is already serialized by axios, parse it for logging
        try {
          const data = typeof request.data === 'string' ? JSON.parse(request.data) : request.data
          console.log(`[ThirdPartyAnthropic] Model: ${data.model}`)
        } catch (e) {
          console.log(`[ThirdPartyAnthropic] Request data: ${request.data?.toString().slice(0, 100)}`)
        }
        return request
      },
      (error: any) => {
        console.error('[ThirdPartyAnthropic] Request error:', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response: any) => {
        console.log(`[ThirdPartyAnthropic] Response status: ${response.status}, id: ${response.data?.id}`)
        return response
      },
      (error: any) => {
        console.error('[ThirdPartyAnthropic] Response error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          code: error.code,
        })
        return Promise.reject(error)
      }
    )
  }

  async createMessage(params: any, options?: any): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/messages', params, {
        signal: options?.signal,
      })
      return response.data
    } catch (error: any) {
      if (axios.isCancel(error)) {
        throw new DOMException('Request cancelled', 'AbortError')
      }
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`)
      }
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        throw new Error(`Network error (${error.code}): ${error.message}`)
      }
      throw error
    }
  }
}

function getClient(apiKey: string, baseUrl?: string): Anthropic | ThirdPartyAnthropicClient {
  // Validate API key
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key is missing or empty')
  }

  // Check if using third-party proxy
  const isThirdParty = baseUrl && !baseUrl.includes('api.anthropic.com')

  if (isThirdParty) {
    const key = `thirdparty:${apiKey}:${baseUrl}`
    if (!thirdPartyCache.has(key)) {
      console.log(`[Anthropic] Creating new third-party client with baseUrl=${baseUrl}`)
      thirdPartyCache.set(key, new ThirdPartyAnthropicClient({ apiKey, baseUrl }))
    }
    return thirdPartyCache.get(key)!
  }

  // Use official SDK for official API
  const key = `${apiKey}:${baseUrl || 'default'}`
  if (!clientCache.has(key)) {
    console.log(`[Anthropic] Creating new official SDK client with baseUrl=${baseUrl || 'default'}`)
    clientCache.set(key, new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    }))
  }
  return clientCache.get(key)!
}

export async function callAnthropic(options: LLMCallOptions, config: LLMProviderConfig): Promise<LLMResponse> {
  const client = getClient(config.apiKey, config.baseUrl)
  const model = options.model || config.defaultModel
  const maxTokens = options.maxTokens ?? config.maxOutputTokens
  const temperature = options.temperature ?? config.temperature

  const messages = convertToAnthropicMessages(options.messages)
  const tools = options.tools ? convertToAnthropicTools(options.tools) : undefined

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

  let response: any
  if (client instanceof ThirdPartyAnthropicClient) {
    response = await client.createMessage(params, requestOptions)
  } else {
    response = await (client as Anthropic).messages.create(params, requestOptions)
  }

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
  const content: ContentBlock[] = []
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
      // Extended thinking blocks are internal reasoning — skip from content output
      // They should not appear in user-facing responses
      continue
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
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
      cacheReadTokens: response.usage.cache_read_input_tokens || 0,
    },
  }
}
