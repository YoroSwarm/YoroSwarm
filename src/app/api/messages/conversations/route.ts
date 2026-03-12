import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { serializeConversation, toConversationType } from '@/lib/server/messages'

const AGENT_CHAT_TITLE_PREFIX = '__agent_chat__'

function buildAgentChatTitle(agentId: string, agentName?: string) {
  const safeName = typeof agentName === 'string' ? agentName.trim() : ''
  return `${AGENT_CHAT_TITLE_PREFIX}:${agentId}:${encodeURIComponent(safeName)}`
}

export async function GET() {
  try {
    const payload = await requireTokenPayload()
    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId: payload.userId },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const items = await Promise.all(
      memberships.map((membership) => serializeConversation(membership.conversation))
    )

    return successResponse({
      items,
      total: items.length,
      page: 1,
      page_size: items.length,
      has_more: false,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get conversations error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const body = await request.json()
    const targetAgentId = typeof body.target_agent_id === 'string' ? body.target_agent_id.trim() : ''
    const targetAgentName = typeof body.target_agent_name === 'string' ? body.target_agent_name.trim() : ''

    if (targetAgentId) {
      const title = buildAgentChatTitle(targetAgentId, targetAgentName)

      const existingMembership = await prisma.conversationParticipant.findFirst({
        where: {
          userId: payload.userId,
          conversation: {
            type: 'DIRECT',
            title,
          },
        },
        include: {
          conversation: {
            include: {
              participants: true,
            },
          },
        },
      })

      if (existingMembership) {
        return successResponse(await serializeConversation(existingMembership.conversation))
      }

      const conversation = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          title,
          participants: {
            create: [{ userId: payload.userId }],
          },
        },
        include: {
          participants: true,
        },
      })

      return successResponse(await serializeConversation(conversation), 'Conversation created successfully')
    }

    const participantIds = Array.isArray(body.participant_ids) ? body.participant_ids as string[] : []
    const uniqueParticipantIds = Array.from(new Set([payload.userId, ...participantIds]))

    const conversation = await prisma.conversation.create({
      data: {
        type: toConversationType(body.type),
        title: body.title,
        participants: {
          create: uniqueParticipantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: true,
      },
    })

    return successResponse(await serializeConversation(conversation), 'Conversation created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create conversation error:', error)
    return errorResponse('Internal server error', 500)
  }
}
