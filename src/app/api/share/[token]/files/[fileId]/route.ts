import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import prisma from '@/lib/db'
import { inferMimeType } from '@/lib/server/session-workspace'

type RouteContext = { params: Promise<{ token: string; fileId: string }> }

function buildContentDisposition(filename: string, inline: boolean) {
  const encoded = encodeURIComponent(filename)
  const safeFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_') || 'file'
  const disposition = inline ? 'inline' : 'attachment'
  return `${disposition}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`
}

// GET — Serve file from share snapshot (no auth required)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token, fileId } = await context.params

    const share = await prisma.sessionShare.findUnique({
      where: { shareToken: token },
      select: {
        snapshotFileIds: true,
        snapshotFilesPath: true,
      },
    })

    if (!share) {
      return new NextResponse('Share not found', { status: 404 })
    }

    // Verify file is in the snapshot
    const allowedFileIds: string[] = JSON.parse(share.snapshotFileIds)
    if (!allowedFileIds.includes(fileId)) {
      return new NextResponse('File not found in this share', { status: 404 })
    }

    if (!share.snapshotFilesPath || !existsSync(share.snapshotFilesPath)) {
      return new NextResponse('Snapshot files not available', { status: 404 })
    }

    // Find the file in snapshot directory (named as {fileId}_{filename})
    const dirEntries = await readdir(share.snapshotFilesPath)
    const matchingFile = dirEntries.find(f => f.startsWith(fileId + '_'))
    if (!matchingFile) {
      return new NextResponse('File not found in snapshot', { status: 404 })
    }

    const filePath = path.join(share.snapshotFilesPath, matchingFile)
    const fileStat = await stat(filePath)
    const originalName = matchingFile.substring(fileId.length + 1)
    const mimeType = inferMimeType(originalName)

    // Check if inline display is requested
    const url = new URL(request.url)
    const inline = url.searchParams.get('inline') === 'true' ||
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf'

    const stream = createReadStream(filePath)
    const webStream = Readable.toWeb(stream) as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileStat.size.toString(),
        'Content-Disposition': buildContentDisposition(originalName, inline),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Share file access error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
