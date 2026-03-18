import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import type { ToolApprovalType, ToolApprovalRequestPayload, ToolApprovalUpdatePayload } from '@/types/websocket'

export interface CreateToolApprovalParams {
  swarmSessionId: string
  agentId: string
  agentName: string
  type: ToolApprovalType
  toolName: string
  inputParams: Record<string, unknown>
  description: string
  workingDir?: string
}

export interface ToolApprovalResult {
  success: boolean
  approvalId?: string
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
  result?: string
  error?: string
}

const APPROVAL_EXPIRY_MS = 5 * 60 * 1000 // 5分钟过期

/**
 * 创建工具审批请求
 */
export async function createToolApproval(params: CreateToolApprovalParams): Promise<ToolApprovalResult> {
  const { swarmSessionId, agentId, agentName, type, toolName, inputParams, description, workingDir } = params

  // 计算过期时间（审批请求过期时间，与命令执行超时时间无关）
  const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS)

  try {
    const approval = await prisma.toolApproval.create({
      data: {
        swarmSessionId,
        agentId,
        type,
        toolName,
        inputParams: JSON.stringify(inputParams),
        description,
        workingDir,
        expiresAt,
      },
    })

    // 发送 WebSocket 通知
    const payload: ToolApprovalRequestPayload = {
      approval_id: approval.id,
      swarm_session_id: swarmSessionId,
      agent_id: agentId,
      agent_name: agentName,
      type,
      tool_name: toolName,
      input_params: inputParams,
      description,
      working_dir: workingDir,
      created_at: approval.createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }

    console.log('[ToolApproval] Publishing tool_approval_request for session:', swarmSessionId)
    publishRealtimeMessage(
      {
        type: 'tool_approval_request',
        payload,
      },
      { sessionId: swarmSessionId }
    )
    console.log('[ToolApproval] publishRealtimeMessage called successfully')

    return {
      success: true,
      approvalId: approval.id,
      status: 'PENDING',
    }
  } catch (error) {
    console.error('[ToolApproval] Failed to create approval request:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create approval request',
    }
  }
}

/**
 * 等待用户审批（带超时）
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs: number = APPROVAL_EXPIRY_MS
): Promise<ToolApprovalResult> {
  const startTime = Date.now()
  const checkInterval = 500 // 每500ms检查一次

  while (Date.now() - startTime < timeoutMs) {
    const approval = await prisma.toolApproval.findUnique({
      where: { id: approvalId },
    })

    if (!approval) {
      return {
        success: false,
        error: 'Approval request not found',
      }
    }

    // 检查是否过期
    if (new Date() > approval.expiresAt) {
      await prisma.toolApproval.update({
        where: { id: approvalId },
        data: { status: 'EXPIRED' },
      })
      return {
        success: false,
        error: 'Approval request expired',
      }
    }

    // 检查状态
    if (approval.status === 'APPROVED') {
      return {
        success: true,
        approvalId,
        status: 'APPROVED',
        result: approval.result || undefined,
      }
    }

    if (approval.status === 'REJECTED') {
      return {
        success: false,
        approvalId,
        status: 'REJECTED',
        error: approval.error || 'User rejected the request',
      }
    }

    if (approval.status === 'CANCELLED') {
      return {
        success: false,
        approvalId,
        status: 'CANCELLED',
        error: approval.error || 'Request was cancelled',
      }
    }

    // 等待一段时间再检查
    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }

  // 超时
  await prisma.toolApproval.update({
    where: { id: approvalId },
    data: { status: 'EXPIRED' },
  })

  return {
    success: false,
    error: 'Approval timeout',
  }
}

/**
 * 执行命令（在获得审批后调用）
 */
export async function executeApprovedCommand(
  approvalId: string,
  swarmSessionId: string,
  agentId: string,
  agentName: string
): Promise<string> {
  const { spawn } = require('child_process')
  const path = require('path')
  const fs = require('fs')

  const approval = await prisma.toolApproval.findUnique({
    where: { id: approvalId },
  })

  if (!approval) {
    throw new Error('Approval not found')
  }

  if (approval.status !== 'APPROVED') {
    throw new Error(`Approval not approved: ${approval.status}`)
  }

  const inputParams = JSON.parse(approval.inputParams) as { command: string; working_dir?: string; timeout?: number }
  const command = inputParams.command
  const workingDir = inputParams.working_dir || path.join(process.cwd(), 'session-workspaces', swarmSessionId)
  const timeoutSec = inputParams.timeout || 30
  const timeoutMs = timeoutSec * 1000

  // 确保工作目录存在，如果不存在则创建
  try {
    await fs.promises.mkdir(workingDir, { recursive: true })
  } catch (mkdirError) {
    const errorMsg = `无法创建工作目录: ${workingDir}`
    await prisma.toolApproval.update({
      where: { id: approvalId },
      data: { error: errorMsg, executedAt: new Date() },
    })
    throw new Error(errorMsg)
  }

  // 加载用户环境变量（如果有）
  let userEnvVars: Record<string, string> = {}
  try {
    const session = await prisma.swarmSession.findUnique({
      where: { id: swarmSessionId },
      select: { userId: true },
    })
    if (session?.userId) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { envVarsJson: true },
      })
      if (user?.envVarsJson) {
        userEnvVars = JSON.parse(user.envVarsJson)
      }
    }
  } catch (envErr) {
    console.warn('[ToolApproval] Failed to load user env vars:', envErr)
  }

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let isResolved = false

    // 检测并使用正确的 shell
    const detectShell = (): string => {
      const platform = process.platform
      if (platform === 'win32') {
        return 'cmd.exe'
      }
      // 检查常见的 shell 路径
      const shells = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/local/bin/zsh', '/usr/local/bin/bash']
      for (const shell of shells) {
        if (fs.existsSync(shell)) {
          return shell
        }
      }
      // 如果都找不到，使用系统默认的 PATH 中的 shell
      return platform === 'darwin' ? 'zsh' : 'bash'
    }

    const shellPath = detectShell()

    const child = spawn(shellPath, ['-c', command], {
      cwd: workingDir,
      env: { ...process.env, PATH: process.env.PATH, ...userEnvVars },
    })

    // 设置超时
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true
        child.kill('SIGTERM')
        const errorMsg = `命令执行超时（${timeoutSec}秒）`
        reject(new Error(errorMsg))
      }
    }, timeoutMs)

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', async (spawnError: Error) => {
      clearTimeout(timer)
      if (isResolved) return
      isResolved = true

      const errorMsg = `无法执行命令: ${spawnError.message}。请检查系统环境是否正确配置。`
      const result = `命令执行失败:\n${errorMsg}\n\n尝试执行的命令: ${command}\n工作目录: ${workingDir}\nShell路径: ${shellPath}`

      // 更新审批结果
      try {
        await prisma.toolApproval.update({
          where: { id: approvalId },
          data: {
            error: errorMsg,
            executedAt: new Date(),
          },
        })

        const payload: ToolApprovalUpdatePayload = {
          approval_id: approvalId,
          swarm_session_id: swarmSessionId,
          agent_id: agentId,
          status: 'REJECTED',
          error: errorMsg,
          executed_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        }

        publishRealtimeMessage(
          {
            type: 'tool_approval_update',
            payload,
          },
          { sessionId: swarmSessionId }
        )
      } catch (updateError) {
        console.error('[ToolApproval] Failed to update approval result:', updateError)
      }

      reject(new Error(result))
    })

    child.on('close', async (code: number | null, signal: string | null) => {
      clearTimeout(timer)
      if (isResolved) return
      isResolved = true

      let result = ''
      let errorMsg = null

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        errorMsg = `命令被终止（超时或信号）`
        result = `${errorMsg}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`
      } else if (code !== 0) {
        errorMsg = `命令执行失败（退出码: ${code}）`
        result = `${errorMsg}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`
      } else {
        result = stdout
        if (stderr) {
          result += `\n\nStderr:\n${stderr}`
        }
      }

      // 更新审批结果
      try {
        await prisma.toolApproval.update({
          where: { id: approvalId },
          data: {
            result: errorMsg ? null : result.slice(0, 10000),
            error: errorMsg,
            executedAt: new Date(),
          },
        })

        const payload: ToolApprovalUpdatePayload = {
          approval_id: approvalId,
          swarm_session_id: swarmSessionId,
          agent_id: agentId,
          status: errorMsg ? 'REJECTED' : 'APPROVED',
          result: errorMsg ? undefined : result.slice(0, 1000),
          error: errorMsg || undefined,
          executed_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        }

        publishRealtimeMessage(
          {
            type: 'tool_approval_update',
            payload,
          },
          { sessionId: swarmSessionId }
        )
      } catch (updateError) {
        console.error('[ToolApproval] Failed to update approval result:', updateError)
      }

      if (errorMsg) {
        reject(new Error(result))
      } else {
        resolve(result)
      }
    })
  })
}

/**
 * 获取待审批的请求列表
 */
export async function getPendingApprovals(swarmSessionId: string) {
  return prisma.toolApproval.findMany({
    where: {
      swarmSessionId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * 处理用户审批决定
 */
export async function handleApprovalDecision(
  approvalId: string,
  decision: 'approve' | 'reject',
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const approval = await prisma.toolApproval.findUnique({
    where: { id: approvalId },
    include: { swarmSession: true },
  })

  if (!approval) {
    return { success: false, error: 'Approval request not found' }
  }

  // 验证用户权限
  if (approval.swarmSession.userId !== userId) {
    return { success: false, error: 'Unauthorized' }
  }

  // 检查状态
  if (approval.status !== 'PENDING') {
    return { success: false, error: `Approval already ${approval.status.toLowerCase()}` }
  }

  // 检查是否过期
  if (new Date() > approval.expiresAt) {
    await prisma.toolApproval.update({
      where: { id: approvalId },
      data: { status: 'EXPIRED' },
    })
    return { success: false, error: 'Approval request expired' }
  }

  const newStatus = decision === 'approve' ? 'APPROVED' : 'REJECTED'

  await prisma.toolApproval.update({
    where: { id: approvalId },
    data: { status: newStatus },
  })

  // 发送更新通知
  const payload: ToolApprovalUpdatePayload = {
    approval_id: approvalId,
    swarm_session_id: approval.swarmSessionId,
    agent_id: approval.agentId,
    status: newStatus,
    timestamp: new Date().toISOString(),
  }

  publishRealtimeMessage(
    {
      type: 'tool_approval_update',
      payload,
    },
    { sessionId: approval.swarmSessionId }
  )

  return { success: true }
}

/**
 * 取消审批请求
 */
export async function cancelApproval(approvalId: string): Promise<boolean> {
  try {
    await prisma.toolApproval.updateMany({
      where: {
        id: approvalId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    })
    return true
  } catch {
    return false
  }
}
