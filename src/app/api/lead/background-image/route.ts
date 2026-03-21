import prisma from '@/lib/db'
import { requireTokenPayload } from '@/lib/server/swarm'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const payload = await requireTokenPayload()

    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return errorResponse('No image file provided', 400)
    }

    if (!file.type.startsWith('image/')) {
      return errorResponse('File must be an image', 400)
    }

    if (file.size > 5 * 1024 * 1024) {
      return errorResponse('File size must be less than 5MB', 400)
    }

    const ext = file.name.split('.').pop() || 'png'
    const filename = `background-${payload.userId}.${ext}`

    const backgroundsDir = path.join(process.cwd(), 'public', 'backgrounds')
    await mkdir(backgroundsDir, { recursive: true })

    // Delete old background image if exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { backgroundImage: true },
    })

    if (user?.backgroundImage) {
      const oldFilename = user.backgroundImage.split('/').pop()?.split('?')[0]
      if (oldFilename) {
        try {
          await unlink(path.join(backgroundsDir, oldFilename))
        } catch {
          // Ignore error if file doesn't exist
        }
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(backgroundsDir, filename), buffer)

    const imageUrl = `/backgrounds/${filename}?t=${Date.now()}`

    await prisma.user.update({
      where: { id: payload.userId },
      data: { backgroundImage: imageUrl },
    })

    return successResponse({ backgroundImage: imageUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Background image upload error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE() {
  try {
    const payload = await requireTokenPayload()

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { backgroundImage: true },
    })

    if (user?.backgroundImage) {
      const filename = user.backgroundImage.split('/').pop()?.split('?')[0]
      if (filename) {
        const backgroundsDir = path.join(process.cwd(), 'public', 'backgrounds')
        try {
          await unlink(path.join(backgroundsDir, filename))
        } catch {
          // Ignore error if file doesn't exist
        }
      }
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: { backgroundImage: null },
    })

    return successResponse({ backgroundImage: null })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Background image delete error:', error)
    return errorResponse('Internal server error', 500)
  }
}
