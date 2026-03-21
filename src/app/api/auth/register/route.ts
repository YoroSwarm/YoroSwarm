import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { verifyAccessCode } from '@/lib/auth/access-code'
import { successResponse, errorResponse } from '@/lib/api/response'
import { DEFAULT_LEAD_AGENTS_MD, DEFAULT_LEAD_SOUL_MD } from '@/lib/constants/lead-preferences'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, email, password, access_code } = body

    // Validate required fields
    if (!username || !email || !password) {
      return errorResponse('请填写用户名、邮箱和密码', 400)
    }

    // Verify access code
    if (!access_code || !verifyAccessCode(access_code)) {
      return errorResponse('邀请码无效或已过期', 403)
    }

    // Validate username
    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(username)) {
      return errorResponse('用户名必须是3-50个字符，只能包含字母、数字、下划线或连字符', 400)
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('请输入有效的邮箱地址', 400)
    }

    // Validate password
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message || '密码格式不正确', 400)
    }

    // Check if username exists
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    })
    if (existingUsername) {
      return errorResponse('该用户名已被注册', 409)
    }

    // Check if email exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    })
    if (existingEmail) {
      return errorResponse('该邮箱已被注册', 409)
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user with default Lead preferences
    const user = await prisma.user.create({
      data: {
        username,
        email,
        hashedPassword,
        isActive: true,
        isSuperuser: false,
        leadAgentsMd: DEFAULT_LEAD_AGENTS_MD,
        leadSoulMd: DEFAULT_LEAD_SOUL_MD,
      },
    })

    return successResponse({
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      isSuperuser: user.isSuperuser,
      createdAt: user.createdAt,
    }, '注册成功')
  } catch (error) {
    console.error('Registration error:', error)
    return errorResponse('服务器内部错误，请稍后重试', 500)
  }
}
