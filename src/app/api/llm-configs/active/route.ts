import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

// GET /api/llm-configs/active - 检查用户是否有可用的 API 配置
export async function GET() {
  try {
    const payload = await requireTokenPayload();

    const count = await prisma.llmApiConfig.count({
      where: {
        userId: payload.userId,
        isEnabled: true,
      },
    });

    return successResponse({
      hasConfig: count > 0,
      count,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Check active LLM configs error:', error);
    return errorResponse('Internal server error', 500);
  }
}
