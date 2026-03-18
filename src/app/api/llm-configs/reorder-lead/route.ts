import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';

interface ReorderItem {
  id: string;
  leadPriority: number;
}

// PUT /api/llm-configs/reorder-lead - 更新 Lead 优先级顺序
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
      if (typeof config.leadPriority !== 'number' || config.leadPriority < 0) {
        return validationErrorResponse(['Each config must have a valid leadPriority']);
      }
    }

    // Update each config's leadPriority
    await prisma.$transaction(
      configs.map((config) =>
        prisma.llmApiConfig.updateMany({
          where: {
            id: config.id,
            userId: payload.userId,
          },
          data: {
            leadPriority: config.leadPriority,
          },
        })
      )
    );

    return successResponse({ success: true }, 'Lead priority updated successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Reorder lead configs error:', error);
    return errorResponse('Internal server error', 500);
  }
}
