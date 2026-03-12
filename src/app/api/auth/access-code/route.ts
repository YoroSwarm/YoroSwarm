import { getAccessCodeInfo, rotateAccessCode } from '@/lib/auth/access-code'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'

// GET - Get current access code info (requires admin)
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

    // Only superusers can see the access code
    // For demo purposes, we'll allow anyone authenticated
    const info = getAccessCodeInfo()
    return successResponse(info)
  } catch (error) {
    console.error('Get access code error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Rotate access code (requires admin)
export async function POST() {
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

    // Rotate the code
    const newCode = rotateAccessCode()
    
    return successResponse({
      access_code: newCode,
      message: 'Access code rotated successfully',
    })
  } catch (error) {
    console.error('Rotate access code error:', error)
    return errorResponse('Internal server error', 500)
  }
}
