import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import prisma from '@/lib/db'
import { inferMimeType } from '@/lib/server/session-workspace'

type RouteContext = { params: Promise<{ token: string }> }

function buildContentDisposition(filename: string, inline: boolean) {
  const encoded = encodeURIComponent(filename)
  const safeFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_') || 'file'
  const disposition = inline ? 'inline' : 'attachment'
  return `${disposition}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`
}

// GET — Serve file from share snapshot using path query parameter (no auth required)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')

    if (!filePath) {
      return new NextResponse('Missing path parameter', { status: 400 })
    }

    // Decode the file path
    const decodedPath = decodeURIComponent(filePath)

    const share = await prisma.sessionShare.findUnique({
      where: { shareToken: token },
      select: {
        snapshotFileIds: true,
        snapshotFilesPath: true,
        snapshotMeta: true,
      },
    })

    if (!share) {
      return new NextResponse('Share not found', { status: 404 })
    }

    if (!share.snapshotFilesPath || !existsSync(share.snapshotFilesPath)) {
      return new NextResponse('Snapshot files not available', { status: 404 })
    }

    // Parse file manifest from snapshotMeta
    // Manifest maps snapshotFilename -> { type, id, originalName }
    let manifest: Record<string, { type: 'fileId' | 'relativePath'; id: string; originalName: string }> = {}
    if (share.snapshotMeta) {
      try {
        const meta = JSON.parse(share.snapshotMeta)
        if (meta.fileManifest) {
          manifest = meta.fileManifest
        }
      } catch { /* ignore parse errors */ }
    }

    let snapshotFilename: string | null = null
    let originalName: string = decodedPath

    // Search manifest by relativePath (id)
    for (const [snapName, entry] of Object.entries(manifest)) {
      if (entry.type === 'relativePath' && entry.id === decodedPath) {
        snapshotFilename = snapName
        originalName = entry.originalName
        break
      }
    }

    // If not found in manifest, try to find file by path pattern
    if (!snapshotFilename) {
      // Try to find a file that matches the decodedPath
      const dirEntries = await readdir(share.snapshotFilesPath)
      // Look for files that contain the decodedPath basename
      const pathBasename = path.basename(decodedPath)
      const matchingFile = dirEntries.find(f => f.endsWith('_' + pathBasename))
      if (matchingFile) {
        snapshotFilename = matchingFile
        originalName = pathBasename
      }
    }

    if (!snapshotFilename) {
      return new NextResponse('File not found in snapshot', { status: 404 })
    }

    const fullPath = path.join(share.snapshotFilesPath, snapshotFilename)
    const fileStat = await stat(fullPath)
    const mimeType = inferMimeType(originalName)

    // Check if inline display is requested
    // If download=1 is specified, always use attachment regardless of file type
    const download = url.searchParams.get('download') === '1'
    const inline = !download && (url.searchParams.get('inline') === 'true' ||
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf')

    const stream = createReadStream(fullPath)
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
