import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { verifyAccessCode } from '@/lib/auth/access-code'
import { successResponse, errorResponse } from '@/lib/api/response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, email, password, access_code } = body

    // Validate required fields
    if (!username || !email || !password) {
      return errorResponse('Username, email, and password are required', 400)
    }

    // Verify access code
    if (!access_code || !verifyAccessCode(access_code)) {
      return errorResponse('Invalid or expired access code', 403)
    }

    // Validate username
    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(username)) {
      return errorResponse('Username must be 3-50 characters, alphanumeric, underscore, or hyphen only', 400)
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email address', 400)
    }

    // Validate password
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || 'Invalid password', 400)
    }

    // Check if username exists
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    })
    if (existingUsername) {
      return errorResponse('Username already exists', 409)
    }

    // Check if email exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    })
    if (existingEmail) {
      return errorResponse('Email already registered', 409)
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        hashedPassword,
        isActive: true,
        isSuperuser: false,
      },
    })

    return successResponse({
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      isSuperuser: user.isSuperuser,
      createdAt: user.createdAt,
    }, 'User registered successfully')
  } catch (error) {
    console.error('Registration error:', error)
    return errorResponse('Internal server error', 500)
  }
}
