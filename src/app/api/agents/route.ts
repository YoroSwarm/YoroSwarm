import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { resolveSessionScope, serializeAgent } from '@/lib/server/swarm'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const agents = await prisma.agent.findMany({
      where: { swarmSessionId: session.id },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse({
      agents: agents.map(serializeAgent),
      total: agents.length,
    })
  } catch (error) {
    console.error('List agents error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const { name, role, description, swarmSessionId, capabilities, config, agent_type, expertise } = body
    const normalizedRole = role || agent_type
    const normalizedCapabilities = capabilities || expertise

    if (!name || !normalizedRole) {
      return errorResponse('Name and role are required', 400)
    }

    if (!swarmSessionId) {
      return errorResponse('swarmSessionId is required', 400)
    }

    const session = await resolveSessionScope({ swarmSessionId })
    if (!session) {
      return errorResponse('Swarm session not found', 404)
    }

    const agent = await prisma.agent.create({
      data: {
        swarmSessionId: session.id,
        name,
        role: normalizedRole,
        description,
        kind: normalizedRole === 'team_lead'
          ? 'LEAD'
          : normalizedRole.includes('research')
            ? 'RESEARCHER'
            : normalizedRole.includes('document')
              ? 'WRITER'
              : normalizedRole.includes('analysis')
                ? 'ANALYST'
                : normalizedRole.includes('engineering')
                  ? 'ENGINEER'
                  : 'WORKER',
        capabilities: normalizedCapabilities ? JSON.stringify(normalizedCapabilities) : null,
        config: JSON.stringify(config || {}),
      },
      include: {
        tasks: true,
      },
    })

    return successResponse({
      agent_id: agent.id,
      name: agent.name,
      status: agent.status.toLowerCase(),
      message: 'Agent created successfully',
    }, 'Agent created successfully')
  } catch (error) {
    console.error('Create agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
