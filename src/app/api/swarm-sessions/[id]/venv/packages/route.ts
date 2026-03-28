import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getSessionVenvBinPath } from '@/lib/server/session-workspace'
import path from 'path'

const execFileAsync = promisify(execFile)

/**
 * GET /api/swarm-sessions/[id]/venv/packages
 * 获取虚拟环境中已安装的包列表
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _payload = await requireTokenPayload()
    const { id: sessionId } = await params

    const venvBinPath = await getSessionVenvBinPath(sessionId)
    const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

    try {
      // 获取已安装的包列表
      const { stdout } = await execFileAsync(pythonPath, ['-m', 'pip', 'list', '--format=json'], {
        timeout: 30000,
      })

      const packages = JSON.parse(stdout || '[]')
      return successResponse({ packages })
    } catch {
      // pip 命令失败，返回空列表
      return successResponse({ packages: [] })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Get venv packages error:', error)
    return errorResponse('Internal server error', 500)
  }
}
