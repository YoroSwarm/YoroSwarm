import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { parseJson, requireTokenPayload } from '@/lib/server/swarm'

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireTokenPayload()
    const { agentId } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        tasks: {
          orderBy: { updatedAt: 'desc' },
          take: Math.min(limit, 100),
        },
      },
    })

    if (!agent) {
      return notFoundResponse('Agent not found')
    }

    const messages = agent.tasks.map((task) => ({
      role: task.status === 'COMPLETED' ? 'system' : 'assistant',
      content: `${task.title}: ${task.description || 'No description'} [${task.status}]`,
      timestamp: task.updatedAt.toISOString(),
    }))

    return successResponse({
      agent_id: agent.id,
      context_stats: {
        message_count: messages.length,
        context_size: JSON.stringify(messages).length,
        max_context_size: parseJson<{ maxContextSize?: number }>(agent.config, {}).maxContextSize || 16000,
      },
      messages,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get agent context error:', error)
    return errorResponse('Internal server error', 500)
  }
}
