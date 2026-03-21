import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { generateAccessToken, generateRefreshToken, generateSessionId } from '@/lib/auth/jwt'
import { successResponse, errorResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return errorResponse('请输入用户名和密码', 400)
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user || !user.isActive) {
      return errorResponse('用户名或密码错误', 401)
    }

    // Verify password
    const isValid = await verifyPassword(password, user.hashedPassword)
    if (!isValid) {
      return errorResponse('用户名或密码错误', 401)
    }

    // Create session
    const sessionId = generateSessionId()
    const refreshToken = generateRefreshToken({
      userId: user.id,
      username: user.username,
      sessionId,
    })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        sessionId,
        expiresAt,
        isActive: true,
      },
    })

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    // Generate access token
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      sessionId,
    })

    // Set cookies
    const cookieStore = await cookies()
    cookieStore.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60, // 30 minutes
      path: '/',
    })
    cookieStore.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return successResponse({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 30 * 60,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        isSuperuser: user.isSuperuser,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return errorResponse('服务器内部错误，请稍后重试', 500)
  }
}
