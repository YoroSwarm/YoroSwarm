import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope } from '@/lib/server/swarm'
import { createInternalThread } from '@/lib/server/internal-bus'

export async function GET(request: NextRequest) {
  try {
    await requireTokenPayload()
    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const threads = await prisma.internalThread.findMany({
      where: { swarmSessionId: session.id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: true,
          },
        },
        relatedTask: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return successResponse({
      threads: threads.map(thread => ({
        id: thread.id,
        thread_type: thread.threadType,
        subject: thread.subject,
        related_task_id: thread.relatedTaskId,
        related_task_title: thread.relatedTask?.title,
        message_count: thread.messages.length,
        last_message: thread.messages[0] ? {
          id: thread.messages[0].id,
          sender_id: thread.messages[0].senderAgentId,
          sender_name: thread.messages[0].sender.name,
          content: thread.messages[0].content.slice(0, 200),
          created_at: thread.messages[0].createdAt.toISOString(),
        } : null,
        created_at: thread.createdAt.toISOString(),
        updated_at: thread.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('List internal threads error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTokenPayload()
    const body = await request.json()
    const { swarmSessionId, threadType, subject, relatedTaskId } = body

    if (!swarmSessionId || !threadType) {
      return errorResponse('swarmSessionId and threadType are required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const thread = await createInternalThread({
      swarmSessionId: session.id,
      threadType,
      subject,
      relatedTaskId,
    })

    return successResponse({
      thread_id: thread.id,
      thread_type: thread.threadType,
      subject: thread.subject,
      created_at: thread.createdAt.toISOString(),
    }, 'Thread created successfully')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Create internal thread error:', error)
    return errorResponse('Internal server error', 500)
  }
}
