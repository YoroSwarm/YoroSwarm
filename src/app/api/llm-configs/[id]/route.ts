import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/llm-configs/[id] - 获取单个配置
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;

    const config = await prisma.llmApiConfig.findFirst({
      where: { id, userId: payload.userId },
    });

    if (!config) {
      return notFoundResponse('LLM API config not found');
    }

    return successResponse({
      ...config,
      apiKey: maskApiKey(config.apiKey),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Get LLM config error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// PATCH /api/llm-configs/[id] - 更新配置
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;
    const body = await request.json();

    // Check ownership
    const existing = await prisma.llmApiConfig.findFirst({
      where: { id, userId: payload.userId },
    });

    if (!existing) {
      return notFoundResponse('LLM API config not found');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return validationErrorResponse(['Name is required']);
      }
      if (body.name.trim().length > 100) {
        return validationErrorResponse(['Name must be less than 100 characters']);
      }
      updateData.name = body.name.trim();
    }

    if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
        return validationErrorResponse(['API Key is required']);
      }
      // Reject masked API keys (e.g., "sk-a****8a3c") to prevent overwriting real keys
      if (/\*{4,}/.test(body.apiKey)) {
        return validationErrorResponse(['Cannot update with masked API key. Please enter the full key.']);
      }
      updateData.apiKey = body.apiKey.trim();
    }

    if (body.baseUrl !== undefined) {
      updateData.baseUrl = body.baseUrl?.trim() || null;
    }

    if (body.defaultModel !== undefined) {
      if (typeof body.defaultModel !== 'string' || body.defaultModel.trim().length === 0) {
        return validationErrorResponse(['Default Model is required']);
      }
      updateData.defaultModel = body.defaultModel.trim();
    }

    if (body.maxContextTokens !== undefined) {
      if (typeof body.maxContextTokens !== 'number' || body.maxContextTokens < 1 || body.maxContextTokens > 2000000) {
        return validationErrorResponse(['Max Context Tokens must be between 1 and 2000000']);
      }
      updateData.maxContextTokens = body.maxContextTokens;
    }

    if (body.maxOutputTokens !== undefined) {
      if (typeof body.maxOutputTokens !== 'number' || body.maxOutputTokens < 1 || body.maxOutputTokens > 128000) {
        return validationErrorResponse(['Max Output Tokens must be between 1 and 128000']);
      }
      updateData.maxOutputTokens = body.maxOutputTokens;
    }

    if (body.temperature !== undefined) {
      if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
        return validationErrorResponse(['Temperature must be between 0 and 2']);
      }
      updateData.temperature = body.temperature;
    }

    if (body.isEnabled !== undefined) {
      updateData.isEnabled = Boolean(body.isEnabled);
    }

    if (body.authMode !== undefined) {
      if (!['BEARER_TOKEN', 'X_API_KEY'].includes(body.authMode)) {
        return validationErrorResponse(['Invalid auth mode']);
      }
      updateData.authMode = body.authMode;
    }

    if (body.customHeaders !== undefined) {
      if (body.customHeaders && typeof body.customHeaders === 'string') {
        try {
          JSON.parse(body.customHeaders);
        } catch {
          return validationErrorResponse(['Custom headers must be valid JSON']);
        }
      }
      updateData.customHeaders = body.customHeaders || null;
    }

    if (Object.keys(updateData).length === 0) {
      return validationErrorResponse(['No fields to update']);
    }

    const config = await prisma.llmApiConfig.update({
      where: { id },
      data: updateData,
    });

    return successResponse(
      {
        ...config,
        apiKey: maskApiKey(config.apiKey),
      },
      'LLM API config updated successfully'
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Update LLM config error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// DELETE /api/llm-configs/[id] - 删除配置
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload();
    const { id } = await context.params;

    // Check ownership
    const existing = await prisma.llmApiConfig.findFirst({
      where: { id, userId: payload.userId },
    });

    if (!existing) {
      return notFoundResponse('LLM API config not found');
    }

    await prisma.llmApiConfig.delete({
      where: { id },
    });

    return successResponse(null, 'LLM API config deleted successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Delete LLM config error:', error);
    return errorResponse('Internal server error', 500);
  }
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }
  return apiKey.slice(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.slice(-4);
}
