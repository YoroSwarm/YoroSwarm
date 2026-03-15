import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { resolveSessionScope } from '@/lib/server/swarm'
import {
  ensureUniqueWorkspaceRelativePath,
  listWorkspaceFiles,
  normalizeWorkspaceRelativePath,
  saveWorkspaceFile,
} from '@/lib/server/session-workspace'

const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600')

function serializeFile(file: Awaited<ReturnType<typeof listWorkspaceFiles>>[number]) {
  return {
    id: file.id,
    filename: file.relativePath,
    originalName: file.name,
    mimeType: file.mimeType,
    size: file.size,
    path: file.relativePath,
    relativePath: file.relativePath,
    directoryPath: file.directoryPath,
    url: file.url,
    createdAt: file.createdAt,
    metadata: JSON.stringify({
      relativePath: file.relativePath,
      directoryPath: file.directoryPath,
      sourceTaskId: file.sourceTaskId,
      sourceAgentId: file.sourceAgentId,
      kind: file.kind,
    }),
  }
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
    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found', 404)
    }

    const files = await listWorkspaceFiles(sessionScope.id)
    return successResponse(files.map(serializeFile))
  } catch (error) {
    console.error('List files error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const swarmSessionId = typeof formData.get('swarmSessionId') == 'string'
      ? formData.get('swarmSessionId') as string
      : typeof formData.get('swarm_session_id') == 'string'
        ? formData.get('swarm_session_id') as string
        : undefined
    const relativePathInput = typeof formData.get('relativePath') == 'string'
      ? formData.get('relativePath') as string
      : typeof formData.get('relative_path') == 'string'
        ? formData.get('relative_path') as string
        : undefined

    if (!file) return errorResponse('No file provided', 400)
    if (file.size > MAX_UPLOAD_SIZE) {
      return errorResponse(`File size exceeds maximum of ${MAX_UPLOAD_SIZE} bytes`, 413)
    }

    const sessionScope = await resolveSessionScope({ swarmSessionId, userId: payload.userId })
    if (!sessionScope) {
      return errorResponse('No swarm session found for file upload', 400)
    }

    const desiredRelativePath = relativePathInput
      ? normalizeWorkspaceRelativePath(relativePathInput)
      : normalizeWorkspaceRelativePath(file.name)
    const relativePath = await ensureUniqueWorkspaceRelativePath(sessionScope.id, desiredRelativePath)
    const bytes = await file.arrayBuffer()

    const fileRecord = await saveWorkspaceFile({
      swarmSessionId: sessionScope.id,
      relativePath,
      content: Buffer.from(bytes),
      mimeType: file.type || 'application/octet-stream',
      mode: 'create',
      metadata: { kind: 'upload' },
    })

    const files = await listWorkspaceFiles(sessionScope.id)
    const serialized = files.find(item => item.id == fileRecord.id)
    if (!serialized) {
      return errorResponse('Uploaded file not found after save', 500)
    }

    return successResponse(serializeFile(serialized), 'File uploaded successfully')
  } catch (error) {
    console.error('Upload file error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
}
