import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getSessionVenvBinPath } from '@/lib/server/session-workspace'
import path from 'path'

const execFileAsync = promisify(execFile)

/**
 * POST /api/swarm-sessions/[id]/venv/packages/action
 * 对虚拟环境中的包执行安装/卸载/更新操作
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _payload = await requireTokenPayload()
    const { id: sessionId } = await params

    const body = await request.json()
    const { action, packages } = body as {
      action: 'install' | 'uninstall' | 'upgrade'
      packages: string[]
    }

    if (!action || !packages || !Array.isArray(packages) || packages.length === 0) {
      return errorResponse('Invalid request: action and packages are required', 400)
    }

    const venvBinPath = await getSessionVenvBinPath(sessionId)
    const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

    let result: { success: boolean; output: string; error?: string } = { success: false, output: '' }

    try {
      let args: string[]

      switch (action) {
        case 'install':
          args = ['-m', 'pip', 'install', ...packages]
          break
        case 'uninstall':
          args = ['-m', 'pip', 'uninstall', '-y', ...packages]
          break
        case 'upgrade':
          args = ['-m', 'pip', 'install', '--upgrade', ...packages]
          break
        default:
          return errorResponse('Invalid action', 400)
      }

      const { stdout, stderr } = await execFileAsync(pythonPath, args, {
        timeout: 300000, // 5 分钟超时
      })

      result = {
        success: true,
        output: stdout + (stderr || ''),
      }
    } catch (execError) {
      result = {
        success: false,
        output: '',
        error: execError instanceof Error ? execError.message : String(execError),
      }
    }

    return successResponse(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }

    console.error('Venv package action error:', error)
    return errorResponse('Internal server error', 500)
  }
}
