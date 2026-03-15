import { createReadStream } from 'fs'
import { stat, unlink } from 'fs/promises'
import { basename } from 'path'
import { Readable } from 'stream'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { errorResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

type RouteContext = {
  params: Promise<{ fileId: string }>
}

function buildContentDisposition(filename: string, inline: boolean) {
  const encoded = encodeURIComponent(filename)
  const safeFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_') || 'file'
  const disposition = inline ? 'inline' : 'attachment'
  return `${disposition}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { fileId } = await context.params
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: payload.userId,
      },
    })

    if (!file) {
      return notFoundResponse('File not found')
    }

    let fileStats
    try {
      fileStats = await stat(file.path)
    } catch {
      return notFoundResponse('Stored file not found')
    }

    const isInline = new URL(request.url).searchParams.get('download') !== '1'
      && (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/'))

    const stream = createReadStream(file.path)

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(fileStats.size),
        'Content-Disposition': buildContentDisposition(file.originalName || basename(file.path), isInline),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Get file error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { fileId } = await context.params
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: payload.userId,
      },
    })

    if (!file) {
      return notFoundResponse('File not found')
    }

    // Delete physical file
    try {
      await unlink(file.path)
    } catch {
      // File may already be deleted from disk, continue
    }
    await prisma.fileThumbnail.deleteMany({
      where: { fileId },
    })

    // Delete file record
    await prisma.file.delete({
      where: { id: fileId },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Delete file error:', error)
    return errorResponse('Internal server error', 500)
  }
}
