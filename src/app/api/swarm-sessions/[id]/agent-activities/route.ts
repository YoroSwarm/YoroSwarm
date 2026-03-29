import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope } from '@/lib/server/swarm'

export interface AgentActivityItem {
  id: string
  agentId: string
  agentName: string
  agentRole: 'lead' | 'teammate'
  agentKind: string
  activityType: 'thinking' | 'tool_call' | 'tool_result' | 'assistant_response' | 'bubble'
  content: string
  metadata?: {
    toolName?: string
    toolInput?: string
    isError?: boolean
    toolCallId?: string
    model?: string
  }
  createdAt: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await params

    const session = await resolveSessionScope({ swarmSessionId: id, userId: payload.userId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    // Get session with lead_agent_id
    const swarmSession = await prisma.swarmSession.findUnique({
      where: { id },
      select: { leadAgentId: true },
    })

    // Get all agents in this session
    const agents = await prisma.agent.findMany({
      where: { swarmSessionId: id },
      select: { id: true, name: true, role: true, kind: true },
    })

    const agentMap = new Map(agents.map(a => [a.id, a]))

    // Get agent context entries for all agents in the session
    const entries = await prisma.agentContextEntry.findMany({
      where: {
        swarmSessionId: id,
        entryType: {
          in: ['thinking', 'tool_call', 'tool_result', 'assistant_response', 'bubble', 'progress_update'],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })

    // Convert each entry to an individual activity item (chronological order)
    const items: AgentActivityItem[] = []

    for (const entry of entries) {
      const agent = agentMap.get(entry.agentId)
      if (!agent) continue

      const baseItem = {
        id: entry.id,
        agentId: entry.agentId,
        agentName: agent.name,
        // Prefer leadAgentId from session, fallback to agent.role === 'lead'
        agentRole: (agent.id === swarmSession?.leadAgentId || agent.role === 'lead' ? 'lead' : 'teammate') as 'lead' | 'teammate',
        agentKind: agent.kind,
        createdAt: entry.createdAt.toISOString(),
      }

      if (entry.entryType === 'thinking') {
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : null
        items.push({
          ...baseItem,
          activityType: 'thinking' as const,
          content: entry.content,
          metadata: {
            ...(metadata?.model ? { model: metadata.model } : {}),
          },
        })
      } else if (entry.entryType === 'assistant_response') {
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : null
        items.push({
          ...baseItem,
          activityType: 'assistant_response' as const,
          content: entry.content,
          metadata: {
            ...(metadata?.model ? { model: metadata.model } : {}),
          },
        })
      } else if (entry.entryType === 'bubble') {
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : null
        items.push({
          ...baseItem,
          activityType: 'bubble' as const,
          content: entry.content,
          metadata: {
            ...(metadata?.model ? { model: metadata.model } : {}),
          },
        })
      } else if (entry.entryType === 'tool_call') {
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : null
        const toolCallId = metadata?.toolCallId || metadata?.tool_call_id || `tc-${entry.agentId}-${entry.createdAt.getTime()}`
        items.push({
          ...baseItem,
          activityType: 'tool_call' as const,
          content: entry.content,
          metadata: {
            toolName: metadata?.toolName || 'unknown',
            toolInput: metadata?.toolInput ? JSON.stringify(metadata.toolInput) : undefined,
            toolCallId,
            ...(metadata?.model ? { model: metadata.model } : {}),
          },
        })
      } else if (entry.entryType === 'tool_result') {
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : null
        const toolName = metadata?.toolName || metadata?.tool_name || 'unknown'
        const toolCallId = metadata?.toolCallId || metadata?.tool_call_id || entry.sourceId || undefined
        items.push({
          ...baseItem,
          activityType: 'tool_result' as const,
          content: entry.content,
          metadata: {
            isError: metadata?.isError || false,
            toolName,
            toolCallId,
            ...(metadata?.model ? { model: metadata.model } : {}),
          },
        })
      }
    }

    return successResponse({
      items,
      total: items.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('List agent activities error:', error)
    return errorResponse('Internal server error', 500)
  }
}
