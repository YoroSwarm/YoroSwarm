import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (token) {
      try {
        const payload = verifyAccessToken(token)
        
        // Invalidate session
        await prisma.session.updateMany({
          where: { 
            sessionId: payload.sessionId,
            userId: payload.userId 
          },
          data: { isActive: false },
        })
      } catch {
        // Token invalid, continue with logout
      }
    }

    // Clear cookies
    cookieStore.delete('access_token')
    cookieStore.delete('refresh_token')

    return successResponse(null, 'Logged out successfully')
  } catch (error) {
    console.error('Logout error:', error)
    return errorResponse('Internal server error', 500)
  }
}
