import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

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
    const kind = searchParams.get('kind')

    const artifacts = await prisma.artifact.findMany({
      where: {
        swarmSession: { userId: payload.userId },
        ...(swarmSessionId ? { swarmSessionId } : {}),
        ...(kind ? { kind } : {}),
      },
      include: {
        ownerAgent: { select: { id: true, name: true, role: true } },
        sourceTask: { select: { id: true, title: true, status: true } },
        file: { select: { id: true, originalName: true, mimeType: true, size: true } },
        swarmSession: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const serialized = artifacts.map(a => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
      swarmSession: a.swarmSession ? { id: a.swarmSession.id, name: a.swarmSession.title } : null,
      ownerAgent: a.ownerAgent ? { id: a.ownerAgent.id, name: a.ownerAgent.name, role: a.ownerAgent.role } : null,
      sourceTask: a.sourceTask ? { id: a.sourceTask.id, title: a.sourceTask.title, status: a.sourceTask.status } : null,
      file: a.file ? {
        id: a.file.id,
        name: a.file.originalName,
        mimeType: a.file.mimeType,
        size: a.file.size,
        url: `/api/files/${a.file.id}`,
      } : null,
      hasContent: !!(a.metadata && JSON.parse(a.metadata).content),
    }))

    return successResponse(serialized)
  } catch (error) {
    console.error('List artifacts error:', error)
    return errorResponse('Internal server error', 500)
  }
}
