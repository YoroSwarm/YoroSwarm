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
        glassEffect: true,
        backgroundImage: true,
        timezone: true,
        autoArchiveDays: true,
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
      glassEffect: Boolean(user.glassEffect),
      backgroundImage: user.backgroundImage || null,
      timezone: user.timezone || null,
      autoArchiveDays: user.autoArchiveDays ?? 7,
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

    const { agentsMd, soulMd, timezone, leadNickname, leadAvatarUrl, glassEffect, backgroundImage, autoArchiveDays } = body;

    // console.log('[API/LeadPreferences] PUT 收到:', {
    //   userId: payload.userId,
    //   agentsMd: agentsMd?.substring(0, 50) || null,
    //   soulMd: soulMd?.substring(0, 50) || null,
    //   timezone,
    //   leadNickname,
    //   leadAvatarUrl,
    //   glassEffect,
    //   backgroundImage,
    //   agentsMdType: typeof agentsMd,
    //   soulMdType: typeof soulMd,
    // })

    if (typeof agentsMd !== 'string' && agentsMd !== null && agentsMd !== undefined) {
      return errorResponse('Invalid agentsMd', 400);
    }

    if (typeof soulMd !== 'string' && soulMd !== null && soulMd !== undefined) {
      return errorResponse('Invalid soulMd', 400);
    }

    if (timezone !== undefined && timezone !== null && typeof timezone !== 'string') {
      return errorResponse('Invalid timezone', 400);
    }

    if (glassEffect !== undefined && typeof glassEffect !== 'boolean') {
      return errorResponse('Invalid glassEffect', 400);
    }

    if (backgroundImage !== undefined && backgroundImage !== null && typeof backgroundImage !== 'string') {
      return errorResponse('Invalid backgroundImage', 400);
    }

    if (autoArchiveDays !== undefined && (typeof autoArchiveDays !== 'number' || autoArchiveDays < 0 || autoArchiveDays > 365)) {
      return errorResponse('Invalid autoArchiveDays: must be a number between 0 and 365', 400);
    }

    // Validate IANA timezone if provided
    if (typeof timezone === 'string') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone })
      } catch {
        return errorResponse('Invalid timezone identifier. Use IANA format, e.g. "Asia/Shanghai"', 400);
      }
    }

    const data: Record<string, string | null | boolean | number> = {}
    if (agentsMd !== undefined) data.leadAgentsMd = agentsMd
    if (soulMd !== undefined) data.leadSoulMd = soulMd
    if (timezone !== undefined) data.timezone = timezone
    if (leadNickname !== undefined) data.leadNickname = leadNickname
    if (leadAvatarUrl !== undefined) data.leadAvatarUrl = leadAvatarUrl
    if (glassEffect !== undefined) data.glassEffect = glassEffect
    if (backgroundImage !== undefined) data.backgroundImage = backgroundImage
    if (autoArchiveDays !== undefined) data.autoArchiveDays = autoArchiveDays

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data,
      select: {
        leadAgentsMd: true,
        leadSoulMd: true,
        leadNickname: true,
        leadAvatarUrl: true,
        glassEffect: true,
        backgroundImage: true,
        timezone: true,
        autoArchiveDays: true,
      },
    });

    // console.log('[API/LeadPreferences] PUT 保存后:', {
    //   leadAgentsMd: user.leadAgentsMd?.substring(0, 50) || null,
    //   leadSoulMd: user.leadSoulMd?.substring(0, 50) || null,
    //   timezone: user.timezone,
    //   leadNickname: user.leadNickname,
    //   leadAvatarUrl: user.leadAvatarUrl,
    //   glassEffect: user.glassEffect,
    //   backgroundImage: user.backgroundImage,
    // })

    return successResponse({
      agentsMd: user.leadAgentsMd || null,
      soulMd: user.leadSoulMd || null,
      leadNickname: user.leadNickname || null,
      leadAvatarUrl: user.leadAvatarUrl || null,
      glassEffect: Boolean(user.glassEffect),
      backgroundImage: user.backgroundImage || null,
      timezone: user.timezone || null,
      autoArchiveDays: user.autoArchiveDays ?? 7,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required');
    }

    console.error('Update lead preferences error:', error);
    return errorResponse('Internal server error', 500);
  }
}
