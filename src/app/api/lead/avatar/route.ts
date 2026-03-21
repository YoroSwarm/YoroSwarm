import prisma from '@/lib/db'
import { requireTokenPayload } from '@/lib/server/swarm'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const payload = await requireTokenPayload()

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
    const filename = `lead-${payload.userId}.${ext}`

    const avatarsDir = path.join(process.cwd(), 'public', 'avatars')
    await mkdir(avatarsDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(avatarsDir, filename), buffer)

    const avatarUrl = `/avatars/${filename}?t=${Date.now()}`

    await prisma.user.update({
      where: { id: payload.userId },
      data: { leadAvatarUrl: avatarUrl },
    })

    return successResponse({ leadAvatarUrl: avatarUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Lead avatar upload error:', error)
    return errorResponse('Internal server error', 500)
  }
}
