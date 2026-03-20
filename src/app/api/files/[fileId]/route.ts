import { createReadStream } from 'fs'
import { stat, unlink } from 'fs/promises'
import { basename } from 'path'
import { Readable } from 'stream'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { errorResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { resolveWorkspaceAbsolutePath, inferMimeType } from '@/lib/server/session-workspace'

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
        swarmSession: { userId: payload.userId },
      },
    })

    if (!file) {
      // Fallback: fileId might reference a workspace file not in DB
      // Search message attachments for this fileId to find the filename
      const messages = await prisma.externalMessage.findMany({
        where: {
          swarmSession: { userId: payload.userId },
        },
        select: { metadata: true, swarmSessionId: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })

      let attachmentInfo: { fileName: string; swarmSessionId: string } | null = null
      for (const msg of messages) {
        try {
          const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata
          const attachments = (meta?.attachments as Array<{ fileId: string; fileName: string }>) || []
          const found = attachments.find(a => a.fileId === fileId)
          if (found) {
            attachmentInfo = { fileName: found.fileName, swarmSessionId: msg.swarmSessionId }
            break
          }
        } catch {
          // Skip unparseable metadata
        }
      }

      if (attachmentInfo) {
        // Try to locate the file in the workspace
        const { listWorkspaceDirectory } = await import('@/lib/server/session-workspace')
        try {
          const tree = await listWorkspaceDirectory(attachmentInfo.swarmSessionId, '', true)
          const entry = tree.entries.find((e: { name: string; type: string }) =>
            e.type === 'file' && e.name === attachmentInfo!.fileName
          )
          if (entry) {
            const resolved = await resolveWorkspaceAbsolutePath(attachmentInfo.swarmSessionId, entry.path)
            const fStats = await stat(resolved.absolutePath)
            const mimeType = inferMimeType(entry.path)
            const isInline = new URL(request.url).searchParams.get('download') !== '1'
              && (mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/')
                || mimeType.startsWith('audio/') || mimeType.startsWith('video/')
                || mimeType.startsWith('application/vnd.openxmlformats-officedocument.')
                || mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel'
                || mimeType === 'application/vnd.ms-powerpoint')

            const stream = createReadStream(resolved.absolutePath)
            return new Response(Readable.toWeb(stream) as ReadableStream, {
              status: 200,
              headers: {
                'Content-Type': mimeType,
                'Content-Length': String(fStats.size),
                'Content-Disposition': buildContentDisposition(attachmentInfo.fileName, isInline),
                'Cache-Control': 'no-cache',
              },
            })
          }
        } catch {
          // Workspace search failed
        }
      }

      return notFoundResponse('File not found')
    }

    let fileStats
    try {
      fileStats = await stat(file.path)
    } catch {
      return notFoundResponse('Stored file not found')
    }

    const isInline = new URL(request.url).searchParams.get('download') !== '1'
      && (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/')
        || file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')
        || file.mimeType.startsWith('application/vnd.openxmlformats-officedocument.')
        || file.mimeType === 'application/msword' || file.mimeType === 'application/vnd.ms-excel'
        || file.mimeType === 'application/vnd.ms-powerpoint')

    const stream = createReadStream(file.path)

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(fileStats.size),
        'Content-Disposition': buildContentDisposition(file.originalName || basename(file.path), isInline),
        'Cache-Control': 'no-cache',
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
        swarmSession: { userId: payload.userId },
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
