import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

// GET - List all teams
export async function GET() {
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

    const teams = await prisma.team.findMany({
      include: {
        agents: true,
        tasks: true,
        workflows: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(teams)
  } catch (error) {
    console.error('List teams error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const { name, description, config } = body

    if (!name) {
      return errorResponse('Team name is required', 400)
    }

    const team = await prisma.team.create({
      data: {
        name,
        description,
        createdBy: payload.userId,
        config: JSON.stringify(config || {}),
      },
      include: {
        agents: true,
        tasks: true,
        workflows: true,
      },
    })

    return successResponse(team, 'Team created successfully')
  } catch (error) {
    console.error('Create team error:', error)
    return errorResponse('Internal server error', 500)
  }
}
