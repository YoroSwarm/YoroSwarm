import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { hashPassword, verifyPassword, validatePassword } from '@/lib/auth/password'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

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
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return errorResponse('Current password and new password are required', 400)
    }

    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return errorResponse(validation.message || 'Invalid password', 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { hashedPassword: true },
    })

    if (!user) return unauthorizedResponse('User not found')

    const isValid = await verifyPassword(currentPassword, user.hashedPassword)
    if (!isValid) {
      return errorResponse('Current password is incorrect', 400)
    }

    const hashed = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: payload.userId },
      data: { hashedPassword: hashed },
    })

    return successResponse({ message: 'Password updated successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return errorResponse('Internal server error', 500)
  }
}
