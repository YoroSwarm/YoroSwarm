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
        leadNickname: true,
        leadAvatarUrl: true,
        timezone: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    return successResponse({
      agentsMd: user.leadAgentsMd || null,
      soulMd: user.leadSoulMd || null,
      leadNickname: user.leadNickname || null,
      leadAvatarUrl: user.leadAvatarUrl || null,
      timezone: user.timezone || null,
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

    const { agentsMd, soulMd, timezone, leadNickname, leadAvatarUrl } = body;

    console.log('[API/LeadPreferences] PUT 收到:', {
      userId: payload.userId,
      agentsMd: agentsMd?.substring(0, 50) || null,
      soulMd: soulMd?.substring(0, 50) || null,
      timezone,
      leadNickname,
      leadAvatarUrl,
      agentsMdType: typeof agentsMd,
      soulMdType: typeof soulMd,
    })

    if (typeof agentsMd !== 'string' && agentsMd !== null && agentsMd !== undefined) {
      return errorResponse('Invalid agentsMd', 400);
    }

    if (typeof soulMd !== 'string' && soulMd !== null && soulMd !== undefined) {
      return errorResponse('Invalid soulMd', 400);
    }

    if (timezone !== undefined && timezone !== null && typeof timezone !== 'string') {
      return errorResponse('Invalid timezone', 400);
    }

    // Validate IANA timezone if provided
    if (typeof timezone === 'string') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone })
      } catch {
        return errorResponse('Invalid timezone identifier. Use IANA format, e.g. "Asia/Shanghai"', 400);
      }
    }

    const data: Record<string, string | null> = {}
    if (agentsMd !== undefined) data.leadAgentsMd = agentsMd
    if (soulMd !== undefined) data.leadSoulMd = soulMd
    if (timezone !== undefined) data.timezone = timezone
    if (leadNickname !== undefined) data.leadNickname = leadNickname
    if (leadAvatarUrl !== undefined) data.leadAvatarUrl = leadAvatarUrl

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data,
      select: {
        leadAgentsMd: true,
        leadSoulMd: true,
        leadNickname: true,
        leadAvatarUrl: true,
        timezone: true,
      },
    });

    console.log('[API/LeadPreferences] PUT 保存后:', {
      leadAgentsMd: user.leadAgentsMd?.substring(0, 50) || null,
      leadSoulMd: user.leadSoulMd?.substring(0, 50) || null,
      timezone: user.timezone,
      leadNickname: user.leadNickname,
      leadAvatarUrl: user.leadAvatarUrl,
    })

    return successResponse({
      agentsMd: user.leadAgentsMd || null,
      soulMd: user.leadSoulMd || null,
      leadNickname: user.leadNickname || null,
      leadAvatarUrl: user.leadAvatarUrl || null,
      timezone: user.timezone || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Update lead preferences error:', error);
    return errorResponse('Internal server error', 500);
  }
}
