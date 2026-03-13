import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { resolveSessionScope } from '@/lib/server/swarm'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600') // 100MB

function serializeFile(file: {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  path: string
  sessionId: string
  swarmSessionId: string
  userId: string | null
  createdAt: Date
  metadata: string | null
}) {
  return {
    id: file.id,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    path: file.path,
    url: `/api/files/${file.id}`,
    sessionId: file.sessionId,
    swarmSessionId: file.swarmSessionId,
    userId: file.userId,
    createdAt: file.createdAt.toISOString(),
    metadata: file.metadata,
  }
}

// GET - List files
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const swarmSessionId = searchParams.get('swarmSessionId') || searchParams.get('swarm_session_id')

    const files = await prisma.file.findMany({
      where: {
        userId: payload.userId,
        ...(swarmSessionId ? { swarmSessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(files.map(serializeFile))
  } catch (error) {
    console.error('List files error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Upload file
export async function POST(request: NextRequest) {
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const swarmSessionId = typeof formData.get('swarmSessionId') === 'string'
      ? formData.get('swarmSessionId') as string
      : typeof formData.get('swarm_session_id') === 'string'
        ? formData.get('swarm_session_id') as string
        : undefined

    if (!file) {
      return errorResponse('No file provided', 400)
    }

    // Check file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return errorResponse(`File size exceeds maximum of ${MAX_UPLOAD_SIZE} bytes`, 413)
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || ''
    const uniqueName = `${randomUUID()}.${ext}`
    const filePath = join(UPLOAD_DIR, uniqueName)

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Save file
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // Get session
    const session = await prisma.session.findFirst({
      where: {
        userId: payload.userId,
        isActive: true,
      },
    })

    if (!session) {
      return errorResponse('No active session found', 400)
    }

    // Save to database
    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found for file upload', 400)
    }

    const fileRecord = await prisma.file.create({
      data: {
        filename: uniqueName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        path: filePath,
        sessionId: session.id,
        swarmSessionId: sessionScope.id,
        userId: payload.userId,
      },
    })

    return successResponse(serializeFile(fileRecord), 'File uploaded successfully')
  } catch (error) {
    console.error('Upload file error:', error)
    return errorResponse('Internal server error', 500)
  }
}
