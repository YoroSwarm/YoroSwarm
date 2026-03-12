import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { SharedTaskStatus } from '@prisma/client'

// GET - List tasks
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
    const status = searchParams.get('status')
    const assigneeId = searchParams.get('assigneeId')
    const teamId = searchParams.get('teamId')

    const tasks = await prisma.sharedTask.findMany({
      where: {
        ...(status ? { status: status.toUpperCase() as SharedTaskStatus } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(teamId ? { teamId } : {}),
      },
      include: {
        subtasks: true,
        parent: true,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return successResponse(tasks)
  } catch (error) {
    console.error('List tasks error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Create a new task
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
    const { title, description, priority, assigneeId, teamId, parentId, dueDate } = body

    if (!title) {
      return errorResponse('Task title is required', 400)
    }

    const task = await prisma.sharedTask.create({
      data: {
        title,
        description,
        priority: priority || 2,
        assigneeId,
        creatorId: payload.userId,
        teamId,
        parentId: parentId ? parseInt(parentId) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'PENDING',
      },
      include: {
        subtasks: true,
        parent: true,
      },
    })

    return successResponse(task, 'Task created successfully')
  } catch (error) {
    console.error('Create task error:', error)
    return errorResponse('Internal server error', 500)
  }
}
