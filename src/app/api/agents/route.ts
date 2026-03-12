import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

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
      include: {
        team: true,
        tasks: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(agents)
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
    const { name, role, description, teamId, capabilities, config } = body

    if (!name || !role || !teamId) {
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
        role,
        description,
        teamId,
        capabilities: capabilities ? JSON.stringify(capabilities) : null,
        config: JSON.stringify(config || {}),
      },
      include: {
        team: true,
      },
    })

    return successResponse(agent, 'Agent created successfully')
  } catch (error) {
    console.error('Create agent error:', error)
    return errorResponse('Internal server error', 500)
  }
}
