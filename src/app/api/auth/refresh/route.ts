import prisma from '@/lib/db'
import { verifyRefreshToken, generateAccessToken, generateRefreshToken, generateSessionId } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh_token')?.value

    if (!refreshToken) {
      return unauthorizedResponse('Refresh token required')
    }

    // Verify refresh token
    try {
      verifyRefreshToken(refreshToken)
    } catch {
      return unauthorizedResponse('Invalid refresh token')
    }

    // Check session in database
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    })

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return unauthorizedResponse('Session expired or invalid')
    }

    // Generate new tokens
    const newSessionId = generateSessionId()
    const newAccessToken = generateAccessToken({
      userId: session.userId,
      username: session.user.username,
      sessionId: newSessionId,
    })
    const newRefreshToken = generateRefreshToken({
      userId: session.userId,
      username: session.user.username,
      sessionId: newSessionId,
    })

    // Update session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.session.create({
      data: {
        userId: session.userId,
        refreshToken: newRefreshToken,
        sessionId: newSessionId,
        expiresAt,
        isActive: true,
      },
    })

    // Invalidate old session
    await prisma.session.update({
      where: { id: session.id },
      data: { isActive: false },
    })

    // Set new cookies
    cookieStore.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60,
      path: '/',
    })
    cookieStore.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return successResponse({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'bearer',
      expires_in: 30 * 60,
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return errorResponse('Internal server error', 500)
  }
}
