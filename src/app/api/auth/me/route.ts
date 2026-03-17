import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

export async function GET() {
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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isActive: true,
        isSuperuser: true,
        createdAt: true,
        lastLogin: true,
      },
    })

    if (!user || !user.isActive) {
      return unauthorizedResponse('User not found or inactive')
    }

    return successResponse({ user })
  } catch (error) {
    console.error('Get current user error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value
    if (!token) return unauthorizedResponse('Authentication required')

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const { displayName, avatarUrl } = body

    const data: Record<string, string | null> = {}
    if (displayName !== undefined) data.displayName = displayName || null
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null

    if (Object.keys(data).length === 0) {
      return errorResponse('No fields to update', 400)
    }

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isActive: true,
        isSuperuser: true,
        createdAt: true,
        lastLogin: true,
      },
    })

    return successResponse({ user })
  } catch (error) {
    console.error('Update user error:', error)
    return errorResponse('Internal server error', 500)
  }
}
