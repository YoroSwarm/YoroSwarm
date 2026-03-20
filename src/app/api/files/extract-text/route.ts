import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { errorResponse, successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api/response'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { resolveSessionScope } from '@/lib/server/swarm'
import { resolveWorkspaceAbsolutePath } from '@/lib/server/session-workspace'
import { stat } from 'fs/promises'
import path from 'path'

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
    try {
      const fileStats = await stat(resolved.absolutePath)
      if (!fileStats.isFile()) {
        return errorResponse('Path is not a file', 400)
      }
    } catch {
      return notFoundResponse('File not found')
    }

    const ext = path.extname(resolved.absolutePath).toLowerCase()

    if (ext === '.doc') {
      const WordExtractor = (await import('word-extractor')).default
      const extractor = new WordExtractor()
      const doc = await extractor.extract(resolved.absolutePath)
      return successResponse({ text: doc.getBody(), format: 'plain' })
    }

    if (ext === '.docx') {
      const mammothModule = await import('mammoth')
      const mammoth = mammothModule as unknown as { convertToHtml: (input: { path: string }) => Promise<{ value: string }> }
      const result = await mammoth.convertToHtml({ path: resolved.absolutePath })
      return successResponse({ html: result.value, format: 'html' })
    }

    return errorResponse(`Unsupported format: ${ext}`, 400)
  } catch (error) {
    console.error('Extract text error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
}
