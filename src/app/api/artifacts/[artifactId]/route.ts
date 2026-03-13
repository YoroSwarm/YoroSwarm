import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

type RouteContext = {
  params: Promise<{ artifactId: string }>
}

export async function GET(request: Request, context: RouteContext) {
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

    const { artifactId } = await context.params
    const artifact = await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        swarmSession: { userId: payload.userId },
      },
      include: {
        ownerAgent: { select: { id: true, name: true, role: true } },
        sourceTask: { select: { id: true, title: true, status: true } },
        file: { select: { id: true, originalName: true, mimeType: true, size: true, path: true } },
        swarmSession: { select: { id: true, title: true } },
      },
    })

    if (!artifact) return notFoundResponse('Artifact not found')

    const metadata = artifact.metadata ? JSON.parse(artifact.metadata) : {}

    return successResponse({
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      summary: artifact.summary,
      content: metadata.content || null,
      createdAt: artifact.createdAt.toISOString(),
      swarmSession: artifact.swarmSession ? { id: artifact.swarmSession.id, name: artifact.swarmSession.title } : null,
      ownerAgent: artifact.ownerAgent ? { id: artifact.ownerAgent.id, name: artifact.ownerAgent.name, role: artifact.ownerAgent.role } : null,
      sourceTask: artifact.sourceTask ? { id: artifact.sourceTask.id, title: artifact.sourceTask.title, status: artifact.sourceTask.status } : null,
      file: artifact.file ? {
        id: artifact.file.id,
        name: artifact.file.originalName,
        mimeType: artifact.file.mimeType,
        size: artifact.file.size,
        url: `/api/files/${artifact.file.id}`,
      } : null,
    })
  } catch (error) {
    console.error('Get artifact error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

    const { artifactId } = await context.params
    const artifact = await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        swarmSession: { userId: payload.userId },
      },
    })

    if (!artifact) return notFoundResponse('Artifact not found')

    await prisma.artifact.delete({ where: { id: artifactId } })

    return successResponse({ success: true })
  } catch (error) {
    console.error('Delete artifact error:', error)
    return errorResponse('Internal server error', 500)
  }
}
