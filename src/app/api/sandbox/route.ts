import { NextRequest } from 'next/server'
import { getSandboxStatus, isSandboxAvailable } from '@/lib/server/sandbox-exec'
import { successResponse } from '@/lib/api/response'

/**
 * GET /api/sandbox
 * 公开端点：返回当前平台的沙盒能力状态
 */
export async function GET(_request: NextRequest) {
  const status = getSandboxStatus()
  return successResponse({
    sandbox: {
      available: status.available,
      platform: status.platform,
      tool: status.tool,
      reason: status.reason,
    },
    policies: [
      { id: 'workspace-write', label: '工作区写入', description: '仅允许写入会话工作区和 /tmp，阻断网络（默认）' },
      { id: 'workspace-write-net', label: '工作区写入 + 网络', description: '仅允许写入会话工作区和 /tmp，允许网络访问' },
      { id: 'read-only', label: '只读', description: '禁止所有写入，阻断网络' },
      { id: 'disabled', label: '禁用', description: '无沙盒，命令以宿主权限运行' },
    ],
  })
}
