import OpenAI from 'openai'
import type {
  LLMCallOptions,
  LLMResponse,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
  StopReason,
} from './types'

let client: OpenAI | null = null

function getClient(apiKey: string, baseUrl?: string): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
    })
  }
  return client
}

export async function callOpenAI(options: LLMCallOptions): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const openai = getClient(apiKey, process.env.OPENAI_BASE_URL)
  const model = options.model || process.env.DEFAULT_LLM_MODEL || 'gpt-4o'
  const maxTokens = options.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)
  const temperature = options.temperature ?? parseFloat(process.env.LLM_TEMPERATURE || '0.7')

  const messages = convertToOpenAIMessages(options.messages, options.systemPrompt)
  const tools = options.tools ? convertToOpenAITools(options.tools) : undefined

  const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools
    params.tool_choice = 'auto'
  }

  const requestOptions: OpenAI.RequestOptions = {}
  if (options.abortSignal) {
    requestOptions.signal = options.abortSignal
  }

  const response = await openai.chat.completions.create(params, requestOptions)
  return convertFromOpenAIResponse(response, model)
}

// ============================================
// Converters
// ============================================

function convertToOpenAIMessages(
  messages: LLMMessage[],
  systemPrompt: string
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = []

  // System prompt first
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
      continue
    }

    // Handle content blocks
    if (msg.role === 'assistant') {
      // Collect text and tool calls
      const textParts: string[] = []
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = []

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text)
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          })
        }
      }

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: textParts.join('') || null,
      }
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls
      }
      result.push(assistantMsg)
    } else if (msg.role === 'user') {
      // Check for tool results
      const toolResults = msg.content.filter(b => b.type === 'tool_result')

      if (toolResults.length > 0) {
        // Each tool result becomes a separate tool message
        for (const tr of toolResults) {
          if (tr.type === 'tool_result') {
            result.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            })
          }
        }
      } else {
        // Regular user message with text blocks
        const text = msg.content
          .filter(b => b.type === 'text')
          .map(b => (b as { text: string }).text)
          .join('')
        result.push({ role: 'user', content: text || '' })
      }
    }
  }

  return result
}

function convertToOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as OpenAI.FunctionParameters,
    },
  }))
}

function convertFromOpenAIResponse(
  response: OpenAI.ChatCompletion,
  modelName: string
): LLMResponse {
  const choice = response.choices[0]
  if (!choice) {
    return {
      content: [{ type: 'text', text: '' }],
      stopReason: 'end_turn',
      model: modelName,
      provider: 'openai',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    }
  }

  const content: ContentBlock[] = []

  // Add text content
  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  // Add tool calls
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if ('function' in tc && tc.function) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          input = { raw: tc.function.arguments }
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        })
      }
    }
  }

  // Map stop reason
  let stopReason: StopReason = 'end_turn'
  if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use'
  else if (choice.finish_reason === 'length') stopReason = 'max_tokens'

  return {
    content: content.length > 0 ? content : [{ type: 'text', text: '' }],
    stopReason,
    model: response.model || modelName,
    provider: 'openai',
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
  }
}
