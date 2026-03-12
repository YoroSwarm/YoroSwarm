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
