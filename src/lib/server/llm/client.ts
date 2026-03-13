import type {
  LLMCallOptions,
  LLMResponse,
  ContentBlock,
  ToolUseBlock,
} from './types'
import { detectProvider, getProviderConfig } from './config'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'

/**
 * 统一 LLM 调用入口
 * 根据 LLM_PROVIDER 环境变量（或自动检测）路由到对应 provider
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const provider = detectProvider()

  if (provider === 'openai') {
    return callOpenAI(options)
  }

  return callAnthropic(options)
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

