import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
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

    const formData = await request.formData()
    const file = formData.get('avatar') as File | null

    if (!file) {
      return errorResponse('No avatar file provided', 400)
    }

    if (!file.type.startsWith('image/')) {
      return errorResponse('File must be an image', 400)
    }

    if (file.size > 2 * 1024 * 1024) {
      return errorResponse('File size must be less than 2MB', 400)
    }

    const ext = file.name.split('.').pop() || 'png'
    const filename = `${payload.userId}.${ext}`

    const avatarsDir = path.join(process.cwd(), 'public', 'avatars')
    await mkdir(avatarsDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(avatarsDir, filename), buffer)

    const avatarUrl = `/avatars/${filename}?t=${Date.now()}`

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: { avatarUrl },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isActive: true,
        isSuperuser: true,
        createdAt: true,
      },
    })

    return successResponse({ user })
  } catch (error) {
    console.error('Avatar upload error:', error)
    return errorResponse('Internal server error', 500)
  }
}
