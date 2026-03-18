import type { LLMProvider, LLMProviderConfig } from './types';

// Re-export for convenience
export type { LLMProvider, LLMProviderConfig } from './types';
import prisma from '@/lib/db';

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
};

const DEFAULT_CONTEXT_SIZE = 128000;

/**
 * Agent 类型，用于选择正确的优先级
 */
export type AgentType = 'lead' | 'teammate';

/**
 * 检测 provider 类型（仅用于环境变量后备）
 * 优先级: LLM_PROVIDER env > 根据可用 API key 自动检测
 */
function detectProviderFromEnv(): LLMProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'openai') return 'openai';
  if (explicit === 'anthropic') return 'anthropic';

  // Auto-detect based on available API keys
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';

  return 'anthropic'; // default
}

/**
 * 从环境变量获取 provider 配置（用于开发环境后备）
 */
function getEnvConfig(): LLMProviderConfig | null {
  const provider = detectProviderFromEnv();

  const apiKey = provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return null;

  const baseUrl = provider === 'openai'
    ? process.env.OPENAI_BASE_URL
    : process.env.ANTHROPIC_BASE_URL;

  const defaultModel = process.env.DEFAULT_LLM_MODEL ||
    (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');

  return {
    provider,
    apiKey,
    baseUrl,
    defaultModel,
    maxContextTokens: process.env.LLM_MAX_CONTEXT_TOKENS
      ? parseInt(process.env.LLM_MAX_CONTEXT_TOKENS, 10)
      : getModelContextSize(defaultModel),
    maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  };
}

/**
 * 获取所有可用的用户配置（按指定优先级排序）
 */
export async function getAllProviderConfigs(
  userId: string,
  agentType: AgentType = 'teammate'
): Promise<Array<LLMProviderConfig & { configId: string }>> {
  const orderByField = agentType === 'lead' ? 'leadPriority' : 'teammatePriority';

  const configs = await prisma.llmApiConfig.findMany({
    where: {
      userId,
      isEnabled: true,
    },
    orderBy: [{ [orderByField]: 'asc' }],
  });

  console.log(`[LLM Config] Found ${configs.length} enabled configs for ${agentType}`);

  return configs.map((config) => {
    const result = {
      configId: config.id,
      provider: config.provider.toLowerCase() as LLMProvider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl && config.baseUrl.trim().length > 0 ? config.baseUrl : undefined,
      defaultModel: config.defaultModel,
      maxContextTokens: config.maxContextTokens,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
    };
    console.log(`[LLM Config] Config "${config.name}": provider=${result.provider}, hasApiKey=${!!result.apiKey && result.apiKey.length > 0}, baseUrl=${result.baseUrl || 'default'}, model=${result.defaultModel}`);
    return result;
  });
}

/**
 * 更新配置的最后使用时间
 */
export async function updateConfigLastUsed(userId: string, configId: string): Promise<void> {
  try {
    await prisma.llmApiConfig.updateMany({
      where: { id: configId, userId },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    // Non-critical, log and continue
    console.warn('Failed to update config lastUsedAt:', error);
  }
}

/**
 * 使用配置执行函数，支持按优先级自动降级
 */
export async function callWithFallback<T>(
  userId: string,
  fn: (config: LLMProviderConfig & { configId: string }) => Promise<T>,
  agentType: AgentType = 'teammate'
): Promise<T> {
  const configs = await getAllProviderConfigs(userId, agentType);

  if (configs.length === 0) {
    throw new Error('No LLM API configuration found. Please configure at least one LLM API in settings.');
  }

  const errors: Array<{ config: LLMProviderConfig & { configId: string }; error: unknown }> = [];

  for (const config of configs) {
    try {
      const result = await fn(config);
      // Update last used time on success
      await updateConfigLastUsed(userId, config.configId);
      return result;
    } catch (error) {
      errors.push({ config, error });
      console.warn(`LLM call failed with provider ${config.provider}, trying next config...`, error);
    }
  }

  // All configs failed
  throw new Error(
    `All LLM API configurations failed. Errors: ${errors.map((e) => `${e.config.provider}: ${e.error}`).join(', ')}`
  );
}

/**
 * 获取完整的 provider 配置
 * 优先从数据库读取用户配置，开发环境可使用环境变量后备
 */
export async function getProviderConfig(
  userId?: string,
  agentType: AgentType = 'teammate'
): Promise<LLMProviderConfig & { configId?: string }> {
  // 如果有 userId，尝试从数据库获取配置
  if (userId) {
    const orderByField = agentType === 'lead' ? 'leadPriority' : 'teammatePriority';

    const config = await prisma.llmApiConfig.findFirst({
      where: {
        userId,
        isEnabled: true,
      },
      orderBy: [{ [orderByField]: 'asc' }],
    });

    if (config) {
      return {
        configId: config.id,
        provider: config.provider.toLowerCase() as LLMProvider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || undefined,
        defaultModel: config.defaultModel,
        maxContextTokens: config.maxContextTokens,
        maxOutputTokens: config.maxOutputTokens,
        temperature: config.temperature,
      };
    }
  }

  // 开发环境后备：使用环境变量
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment) {
    const envConfig = getEnvConfig();
    if (envConfig) {
      return envConfig;
    }
  }

  // 没有可用配置
  throw new Error(
    userId
      ? 'No LLM API configuration found. Please configure at least one LLM API in settings.'
      : 'No LLM API configuration available. Please set up API keys in environment variables or configure user settings.'
  );
}

/**
 * 获取模型的上下文窗口大小
 */
export function getModelContextSize(model: string): number {
  // Check exact match
  if (MODEL_CONTEXT_SIZES[model]) return MODEL_CONTEXT_SIZES[model];

  // Check prefix match (for versioned model names)
  for (const [key, size] of Object.entries(MODEL_CONTEXT_SIZES)) {
    if (model.startsWith(key)) return size;
  }

  // Check custom env override
  if (process.env.LLM_MAX_CONTEXT_TOKENS) {
    return parseInt(process.env.LLM_MAX_CONTEXT_TOKENS, 10);
  }

  return DEFAULT_CONTEXT_SIZE;
}
