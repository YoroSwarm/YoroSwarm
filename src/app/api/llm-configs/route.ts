import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

// GET /api/llm-configs - 获取用户的所有 API 配置
export async function GET() {
  try {
    const payload = await requireTokenPayload();

    const configs = await prisma.llmApiConfig.findMany({
      where: { userId: payload.userId },
      orderBy: [{ leadPriority: 'asc' }, { createdAt: 'desc' }],
    });

    // Mask API keys for security
    const maskedConfigs = configs.map((config) => ({
      ...config,
      apiKey: maskApiKey(config.apiKey),
    }));

    return successResponse(maskedConfigs);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('List LLM configs error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// POST /api/llm-configs - 创建新的 API 配置
export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    // Validation
    const validation = validateLlmApiConfig(body);
    if (!validation.valid) {
      return validationErrorResponse(validation.errors || ['Validation failed']);
    }

    // Get the highest leadPriority and teammatePriority for this user
    const maxPriorities = await prisma.llmApiConfig.findFirst({
      where: { userId: payload.userId },
      orderBy: [
        { leadPriority: 'desc' },
        { teammatePriority: 'desc' },
      ],
      select: { leadPriority: true, teammatePriority: true },
    });

    const newLeadPriority = (maxPriorities?.leadPriority ?? 999) + 1;
    const newTeammatePriority = (maxPriorities?.teammatePriority ?? 999) + 1;

    const config = await prisma.llmApiConfig.create({
      data: {
        userId: payload.userId,
        provider: body.provider,
        name: body.name.trim(),
        apiKey: body.apiKey.trim(),
        baseUrl: body.baseUrl?.trim() || '',
        defaultModel: body.defaultModel.trim(),
        maxContextTokens: body.maxContextTokens ?? 128000,
        maxOutputTokens: body.maxOutputTokens ?? 4096,
        temperature: body.temperature ?? 0.7,
        authMode: body.authMode || 'BEARER_TOKEN',
        customHeaders: body.customHeaders || null,
        leadPriority: newLeadPriority,
        teammatePriority: newTeammatePriority,
        isEnabled: true,
      },
    });

    // Return masked config
    return successResponse(
      {
        ...config,
        apiKey: maskApiKey(config.apiKey),
      },
      'LLM API config created successfully'
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Create LLM config error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// Helper functions
function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }
  return apiKey.slice(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.slice(-4);
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

function validateLlmApiConfig(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid request body'] };
  }

  const body = data as Record<string, unknown>;

  // Provider
  const validProviders = ['ANTHROPIC'];
  if (!body.provider || typeof body.provider !== 'string' || !validProviders.includes(body.provider)) {
    errors.push('Invalid provider. Must be: ANTHROPIC');
  }

  // Name
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('Name is required');
  } else if (body.name.trim().length > 100) {
    errors.push('Name must be less than 100 characters');
  }

  // API Key
  if (!body.apiKey || typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
    errors.push('API Key is required');
  }

  // Base URL (required for all providers)
  if (!body.baseUrl || typeof body.baseUrl !== 'string' || body.baseUrl.trim().length === 0) {
    errors.push('Base URL is required');
  }

  // Default Model
  if (!body.defaultModel || typeof body.defaultModel !== 'string' || body.defaultModel.trim().length === 0) {
    errors.push('Default Model is required');
  }

  // Max Context Tokens
  if (body.maxContextTokens !== undefined && (typeof body.maxContextTokens !== 'number' || body.maxContextTokens < 1 || body.maxContextTokens > 2000000)) {
    errors.push('Max Context Tokens must be between 1 and 2000000');
  }

  // Max Output Tokens
  if (body.maxOutputTokens !== undefined && (typeof body.maxOutputTokens !== 'number' || body.maxOutputTokens < 1 || body.maxOutputTokens > 128000)) {
    errors.push('Max Output Tokens must be between 1 and 128000');
  }

  // Temperature
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
