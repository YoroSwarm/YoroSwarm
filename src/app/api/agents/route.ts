import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { serializeAgent } from '@/lib/server/swarm'

// GET - List all agents
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
    const teamId = searchParams.get('teamId')

    const agents = await prisma.agent.findMany({
      where: teamId ? { teamId } : undefined,
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

// POST - Create a new agent
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
    const { name, role, description, teamId, capabilities, config, agent_type, expertise } = body
    const normalizedRole = role || agent_type
    const normalizedCapabilities = capabilities || expertise

    if (!name || !normalizedRole || !teamId) {
      return errorResponse('Name, role, and teamId are required', 400)
    }

    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      return errorResponse('Team not found', 404)
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        role: normalizedRole,
        description,
        teamId,
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
