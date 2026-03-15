import { createReadStream } from 'fs'
import { stat, unlink } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/response'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { resolveSessionScope } from '@/lib/server/swarm'
import { findWorkspaceFileByPath, resolveWorkspaceAbsolutePath } from '@/lib/server/session-workspace'

function buildContentDisposition(filename: string, inline: boolean) {
  const encoded = encodeURIComponent(filename)
  const safeFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_') || 'file'
  const disposition = inline ? 'inline' : 'attachment'
  return `${disposition}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')
    const relativePath = searchParams.get('path') || ''
    if (!relativePath) {
      return errorResponse('Missing path', 400)
    }

    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found', 404)
    }

    const resolved = await resolveWorkspaceAbsolutePath(sessionScope.id, relativePath)
    let fileStats
    try {
      fileStats = await stat(resolved.absolutePath)
    } catch {
      return notFoundResponse('File not found')
    }

    if (!fileStats.isFile()) {
      return errorResponse('Path is not a file', 400)
    }

    const fileRecord = await findWorkspaceFileByPath(sessionScope.id, resolved.relativePath)
    const mimeType = fileRecord?.mimeType || 'application/octet-stream'
    const originalName = fileRecord?.originalName || path.posix.basename(resolved.relativePath)
    const isInline = new URL(request.url).searchParams.get('download') !== '1'
      && (mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/'))

    const stream = createReadStream(resolved.absolutePath)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileStats.size),
        'Content-Disposition': buildContentDisposition(originalName, isInline),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Get file by path error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')
    const relativePath = searchParams.get('path') || ''
    if (!relativePath) {
      return errorResponse('Missing path', 400)
    }

    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found', 404)
    }

    const resolved = await resolveWorkspaceAbsolutePath(sessionScope.id, relativePath)
    try {
      await unlink(resolved.absolutePath)
    } catch {
      return notFoundResponse('File not found')
    }

    const fileRecord = await findWorkspaceFileByPath(sessionScope.id, resolved.relativePath)
    if (fileRecord) {
      await prisma.fileThumbnail.deleteMany({ where: { fileId: fileRecord.id } })
      await prisma.file.delete({ where: { id: fileRecord.id } })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Delete file by path error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
}
