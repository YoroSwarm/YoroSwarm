import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

interface ReorderItem {
  id: string;
  teammatePriority: number;
}

// PUT /api/llm-configs/reorder-teammate - 更新 Teammate 优先级顺序
export async function PUT(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    // Validation
    if (!body.configs || !Array.isArray(body.configs)) {
      return validationErrorResponse(['configs array is required']);
    }

    const configs: ReorderItem[] = body.configs;

    // Validate each config item
    for (const config of configs) {
      if (!config.id || typeof config.id !== 'string') {
        return validationErrorResponse(['Each config must have a valid id']);
      }
      if (typeof config.teammatePriority !== 'number' || config.teammatePriority < 0) {
        return validationErrorResponse(['Each config must have a valid teammatePriority']);
      }
    }

    // Update each config's teammatePriority
    await prisma.$transaction(
      configs.map((config) =>
        prisma.llmApiConfig.updateMany({
          where: {
            id: config.id,
            userId: payload.userId,
          },
          data: {
            teammatePriority: config.teammatePriority,
          },
        })
      )
    );

    return successResponse({ success: true }, 'Teammate priority updated successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Reorder teammate configs error:', error);
    return errorResponse('Internal server error', 500);
  }
}
