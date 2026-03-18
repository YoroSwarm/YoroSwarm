import type {
  LLMCallOptions,
  LLMResponse,
  ContentBlock,
  ToolUseBlock,
  LLMMessage,
  ToolResultBlock,
  ToolUseBlock as MessageToolUseBlock,
} from './types'
import { callWithFallback, getProviderConfig } from './config'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { recordLlmUsageEvent } from './usage'

function isToolUseBlock(block: ContentBlock): block is MessageToolUseBlock {
  return block.type === 'tool_use'
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result'
}

function buildToolCallFallbackText(block: MessageToolUseBlock): string {
  return `[Previous: used ${block.name}]`
}

function buildToolResultFallbackText(block: ToolResultBlock): string {
  return `[Previous: tool result for ${block.tool_use_id.slice(0, 12)}]`
}

function countToolResults(messages: LLMMessage[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const message of messages) {
    if (typeof message.content === 'string') continue
    for (const block of message.content) {
      if (!isToolResultBlock(block)) continue
      counts.set(block.tool_use_id, (counts.get(block.tool_use_id) || 0) + 1)
    }
  }

  return counts
}

function sanitizeLLMMessages(messages: LLMMessage[]): LLMMessage[] {
  const pendingToolResults = countToolResults(messages)
  const activeToolUseIds = new Set<string>()

  return messages.map(message => {
    if (typeof message.content === 'string') {
      return message
    }

    const nextBlocks: ContentBlock[] = []

    for (const block of message.content) {
      if (block.type === 'text') {
        nextBlocks.push(block)
        continue
      }

      if (isToolUseBlock(block)) {
        const remainingResults = pendingToolResults.get(block.id) || 0
        if (remainingResults > 0) {
          activeToolUseIds.add(block.id)
          nextBlocks.push(block)
        } else {
          nextBlocks.push({ type: 'text', text: buildToolCallFallbackText(block) })
        }
        continue
      }

      const remainingResults = pendingToolResults.get(block.tool_use_id) || 0
      if (activeToolUseIds.has(block.tool_use_id) && remainingResults > 0) {
        pendingToolResults.set(block.tool_use_id, remainingResults - 1)
        activeToolUseIds.delete(block.tool_use_id)
        nextBlocks.push(block)
      } else {
        nextBlocks.push({ type: 'text', text: buildToolResultFallbackText(block) })
      }
    }

    return {
      role: message.role,
      content: nextBlocks,
    }
  })
}

/**
 * 指数退避重试
 * @param fn - 要执行的异步函数
 * @param maxRetries - 最大重试次数
 * @param baseDelayMs - 基础延迟时间（毫秒）
 */
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // 检查是否是可重试的错误
      const isRetryable = isRetryableError(error)

      if (!isRetryable || attempt === maxRetries) {
        throw error
      }

      // 计算延迟时间：baseDelayMs * 2^attempt + 随机抖动
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000
      console.warn(`LLM request failed, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})...`, error)

      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase()
    const errorName = error.name.toLowerCase()

    // 网络错误
    if (
      errorName.includes('network') ||
      errorName.includes('fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('econnreset')
    ) {
      return true
    }

    // HTTP 429 Too Many Requests
    if (errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
      return true
    }

    // HTTP 5xx 服务器错误
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') || errorMessage.includes('504')) {
      return true
    }

    // 超时错误
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return true
    }
  }

  return false
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 统一 LLM 调用入口
 * 支持多配置回退、指数退避重试
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  if (!options.userId) {
    throw new Error(
      'userId is required for LLM API calls. All model configurations must be set up in user settings.'
    )
  }

  const sanitizedOptions: LLMCallOptions = {
    ...options,
    messages: sanitizeLLMMessages(options.messages),
  }

  // 使用 callWithFallback 实现多配置回退
  return callWithFallback(
    options.userId,
    async (config) => {
      // 对每个配置进行指数退避重试
      const response = await retryWithExponentialBackoff(async () => {
        if (config.provider === 'openai') {
          return await callOpenAI(sanitizedOptions, config)
        } else {
          return await callAnthropic(sanitizedOptions, config)
        }
      })

      // 记录使用事件
      await recordLlmUsageEvent({
        provider: config.provider,
        response,
        swarmSessionId: options.usageContext?.swarmSessionId,
        agentId: options.usageContext?.agentId,
        requestKind: options.usageContext?.requestKind,
      })

      return response
    },
    options.agentType || 'teammate'
  )
}

/**
 * 检测并清理代理 API 生成的 "(Empty response: ...)" 占位文本
 * 某些 API 代理（如 Kimi）会在 LLM 仅返回 thinking 块（无文本内容）时，
 * 将原始响应包装为 "(Empty response: {raw response})" 格式的文本块注入。
 * 这种文本不应作为有效内容保存或展示。
 */
function stripProxyEmptyResponse(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('(Empty response:') && trimmed.endsWith(')')) {
    return ''
  }
  return trimmed
}

/**
 * 从 LLMResponse 提取纯文本内容
 */
export function extractTextContent(response: LLMResponse): string {
  const raw = response.content
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('')
  return stripProxyEmptyResponse(raw)
}

/**
 * 从 LLMResponse 提取工具调用块
 */
export function extractToolUseBlocks(response: LLMResponse): ToolUseBlock[] {
  return response.content.filter(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  )
}

/**
 * 获取当前 LLM 配置信息（用于调试/监控）
 */
export async function getLLMInfo(userId?: string, agentType: 'lead' | 'teammate' = 'teammate') {
  const config = await getProviderConfig(userId, agentType)
  return {
    provider: config.provider,
    model: config.defaultModel,
    maxContextTokens: config.maxContextTokens,
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    hasApiKey: !!config.apiKey,
    baseUrl: config.baseUrl || '(default)',
  }
}
