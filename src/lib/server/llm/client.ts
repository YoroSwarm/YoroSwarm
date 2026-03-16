import type {
  LLMCallOptions,
  LLMResponse,
  ContentBlock,
  ToolUseBlock,
  LLMMessage,
  ToolResultBlock,
  ToolUseBlock as MessageToolUseBlock,
} from './types'
import { detectProvider, getProviderConfig } from './config'
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
 * 统一 LLM 调用入口
 * 根据 LLM_PROVIDER 环境变量（或自动检测）路由到对应 provider
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const provider = detectProvider()
  const sanitizedOptions: LLMCallOptions = {
    ...options,
    messages: sanitizeLLMMessages(options.messages),
  }

  const response = provider === 'openai'
    ? await callOpenAI(sanitizedOptions)
    : await callAnthropic(sanitizedOptions)

  await recordLlmUsageEvent({
    provider,
    response,
    swarmSessionId: options.usageContext?.swarmSessionId,
    agentId: options.usageContext?.agentId,
    requestKind: options.usageContext?.requestKind,
  })

  return response
}

/**
 * 从 LLMResponse 提取纯文本内容
 */
export function extractTextContent(response: LLMResponse): string {
  return response.content
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('')
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
export function getLLMInfo() {
  const config = getProviderConfig()
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
