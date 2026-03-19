import { NextRequest } from 'next/server';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response';
import { requireTokenPayload } from '@/lib/server/swarm';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest) {
  try {
    const payload = await requireTokenPayload();

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        leadAgentsMd: true,
        leadSoulMd: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // console.log('[API/LeadPreferences] GET 返回:', {
    //   userId: payload.userId,
    //   leadAgentsMd: user.leadAgentsMd?.substring(0, 50) || null,
    //   leadSoulMd: user.leadSoulMd?.substring(0, 50) || null,
    // })

    return successResponse({
      agentsMd: user.leadAgentsMd || null,
      soulMd: user.leadSoulMd || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Get lead preferences error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireTokenPayload();
    const body = await request.json();

    const { agentsMd, soulMd } = body;

    console.log('[API/LeadPreferences] PUT 收到:', {
      userId: payload.userId,
      agentsMd: agentsMd?.substring(0, 50) || null,
      soulMd: soulMd?.substring(0, 50) || null,
      agentsMdType: typeof agentsMd,
      soulMdType: typeof soulMd,
    })

    if (typeof agentsMd !== 'string' && agentsMd !== null) {
      return errorResponse('Invalid agentsMd', 400);
    }

    if (typeof soulMd !== 'string' && soulMd !== null) {
      return errorResponse('Invalid soulMd', 400);
    }

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        leadAgentsMd: agentsMd,
        leadSoulMd: soulMd,
      },
      select: {
        leadAgentsMd: true,
        leadSoulMd: true,
      },
    });

    console.log('[API/LeadPreferences] PUT 保存后:', {
      leadAgentsMd: user.leadAgentsMd?.substring(0, 50) || null,
      leadSoulMd: user.leadSoulMd?.substring(0, 50) || null,
    })

    return successResponse({
      agentsMd: user.leadAgentsMd || null,
      soulMd: user.leadSoulMd || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Update lead preferences error:', error);
    return errorResponse('Internal server error', 500);
  }
}
