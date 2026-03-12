import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600') // 100MB

// GET - List files
export async function GET() {
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

    const files = await prisma.file.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(files)
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
    const fileRecord = await prisma.file.create({
      data: {
        filename: uniqueName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        path: filePath,
        sessionId: session.id,
        userId: payload.userId,
      },
    })

    return successResponse(fileRecord, 'File uploaded successfully')
  } catch (error) {
    console.error('Upload file error:', error)
    return errorResponse('Internal server error', 500)
  }
}
