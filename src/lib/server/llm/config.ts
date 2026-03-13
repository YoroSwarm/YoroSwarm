import type { LLMProvider, LLMProviderConfig } from './types'

/**
 * 预设的模型上下文大小（tokens）
 * 用于截断上下文、估算使用量等
 */
const MODEL_CONTEXT_SIZES: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
  // DeepSeek
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
}

const DEFAULT_CONTEXT_SIZE = 128000

/**
 * 检测 provider 类型
 * 优先级: LLM_PROVIDER env > 根据可用 API key 自动检测
 */
export function detectProvider(): LLMProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase()
  if (explicit === 'openai') return 'openai'
  if (explicit === 'anthropic') return 'anthropic'

  // Auto-detect based on available API keys
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'

  return 'anthropic' // default
}

/**
 * 获取完整的 provider 配置
 */
export function getProviderConfig(): LLMProviderConfig {
  const provider = detectProvider()

  const apiKey = provider === 'openai'
    ? (process.env.OPENAI_API_KEY || '')
    : (process.env.ANTHROPIC_API_KEY || '')

  const baseUrl = provider === 'openai'
    ? process.env.OPENAI_BASE_URL
    : process.env.ANTHROPIC_BASE_URL

  const defaultModel = process.env.DEFAULT_LLM_MODEL ||
    (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514')

  const maxContextTokens = process.env.LLM_MAX_CONTEXT_TOKENS
    ? parseInt(process.env.LLM_MAX_CONTEXT_TOKENS, 10)
    : getModelContextSize(defaultModel)

  const maxOutputTokens = parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)

  const temperature = parseFloat(process.env.LLM_TEMPERATURE || '0.7')

  return {
    provider,
    apiKey,
    baseUrl,
    defaultModel,
    maxContextTokens,
    maxOutputTokens,
    temperature,
  }
}

/**
 * 获取模型的上下文窗口大小
 */
export function getModelContextSize(model: string): number {
  // Check exact match
  if (MODEL_CONTEXT_SIZES[model]) return MODEL_CONTEXT_SIZES[model]

  // Check prefix match (for versioned model names)
  for (const [key, size] of Object.entries(MODEL_CONTEXT_SIZES)) {
    if (model.startsWith(key)) return size
  }

  // Check custom env override
  if (process.env.LLM_MAX_CONTEXT_TOKENS) {
    return parseInt(process.env.LLM_MAX_CONTEXT_TOKENS, 10)
  }

  return DEFAULT_CONTEXT_SIZE
}
