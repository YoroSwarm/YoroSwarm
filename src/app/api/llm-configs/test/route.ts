import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import { callAnthropic } from '@/lib/server/llm/anthropic';

// POST /api/llm-configs/test - 测试 API 配置是否有效
export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    const configId = body.configId;
    if (!configId || typeof configId !== 'string') {
      return validationErrorResponse(['configId is required']);
    }

    // 获取配置
    const config = await prisma.llmApiConfig.findFirst({
      where: {
        id: configId,
        userId: payload.userId,
      },
    });

    if (!config) {
      return errorResponse('Configuration not found', 404);
    }

    // 构建测试请求
    const testRequest = {
      systemPrompt: 'You are a helpful assistant.',
      messages: [
        { role: 'user' as const, content: 'Say "Hello!" in exactly one word.' }
      ],
      maxTokens: 10,
    };

    const providerConfig = {
      configId: config.id,
      provider: 'anthropic' as const,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl && config.baseUrl.trim().length > 0 ? config.baseUrl : undefined,
      defaultModel: config.defaultModel,
      maxContextTokens: config.maxContextTokens,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
    };

    console.log(`[Test Config] Testing config "${config.name}":`, {
      provider: providerConfig.provider,
      hasApiKey: !!providerConfig.apiKey && providerConfig.apiKey.length > 0,
      apiKeyLength: providerConfig.apiKey?.length || 0,
      baseUrl: providerConfig.baseUrl || 'default',
      model: providerConfig.defaultModel,
    });

    let response;
    try {
      response = await callAnthropic(testRequest, providerConfig);

      const textContent = response.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map(block => block.text)
        .join('');

      return successResponse({
        success: true,
        configName: config.name,
        provider: config.provider,
        model: response.model,
        response: textContent.trim(),
        usage: response.usage,
      }, 'Configuration test successful');
    } catch (error) {
      console.error('[Test Config] Error:', error);
      return errorResponse(
        `Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        400
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Test LLM config error:', error);
    return errorResponse('Internal server error', 500);
  }
}
