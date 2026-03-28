import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import type { ToolApprovalType, ToolApprovalRequestPayload, ToolApprovalUpdatePayload } from '@/types/websocket'
import { evaluateApproval } from './session-approval-rules'
import { assessCommandRisk, type RiskLevel } from './command-risk'
import { getSessionVenvBinPath, buildVenvEnvPath } from './session-workspace'
import { buildSandboxedSpawnArgs, determineSandboxPolicy, type SandboxPolicy } from './sandbox-exec'
import { resolveEffectivePolicy, getSessionSandboxConfig } from './sandbox-config'

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
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'AUTO_APPROVED' | 'AUTO_REJECTED'
  result?: string
  error?: string
  riskLevel?: RiskLevel
  riskReason?: string
  riskCategory?: string
  autoDecision?: boolean
}

const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000 // 审批请求不限时（设为24小时仅作DB占位）

/**
 * 智能审批入口 — 在创建审批请求之前评估是否需要人工审批
 * 返回 autoDecision=true 表示已自动处理（放行或拒绝），无需等待用户
 */
export async function smartApproval(params: CreateToolApprovalParams): Promise<ToolApprovalResult> {
  const { swarmSessionId, type, inputParams } = params

  // 仅对 SHELL_EXEC 类型启用智能审批
  if (type !== 'SHELL_EXEC') {
    return createToolApproval(params)
  }

  const command = (inputParams.command as string) || ''
  const decision = evaluateApproval(swarmSessionId, command)

  if (decision.action === 'auto_approve') {
    // 自动放行：创建一条已批准的记录用于审计
    const approval = await prisma.toolApproval.create({
      data: {
        swarmSessionId,
        agentId: params.agentId,
        type,
        toolName: params.toolName,
        inputParams: JSON.stringify(inputParams),
        description: params.description,
        workingDir: params.workingDir,
        status: 'APPROVED',
        expiresAt: new Date(Date.now() + APPROVAL_EXPIRY_MS),
      },
    })

    console.log(`[SmartApproval] Auto-approved (${decision.riskLevel}): ${command.slice(0, 80)}`)

    // 发送自动放行通知
    publishRealtimeMessage(
      {
        type: 'tool_approval_update',
        payload: {
          approval_id: approval.id,
          swarm_session_id: swarmSessionId,
          agent_id: params.agentId,
          status: 'APPROVED',
          timestamp: new Date().toISOString(),
        } satisfies ToolApprovalUpdatePayload,
      },
      { sessionId: swarmSessionId }
    )

    return {
      success: true,
      approvalId: approval.id,
      status: 'AUTO_APPROVED',
      riskLevel: decision.riskLevel,
      riskReason: decision.riskReason,
      riskCategory: decision.riskCategory,
      autoDecision: true,
    }
  }

  if (decision.action === 'always_reject') {
    console.log(`[SmartApproval] Auto-rejected (rule: ${decision.matchedRule?.description}): ${command.slice(0, 80)}`)
    return {
      success: false,
      status: 'AUTO_REJECTED',
      error: `命令被会话规则自动拒绝: ${decision.matchedRule?.description || '未知规则'}`,
      riskLevel: decision.riskLevel,
      riskReason: decision.riskReason,
      riskCategory: decision.riskCategory,
      autoDecision: true,
    }
  }

  // 需要人工审批 — 走原有流程，但附带风险信息
  return createToolApprovalWithRisk(params, decision.riskLevel, decision.riskReason, decision.riskCategory)
}

/**
 * 创建带风险信息的审批请求
 */
async function createToolApprovalWithRisk(
  params: CreateToolApprovalParams,
  riskLevel: RiskLevel,
  riskReason: string,
  riskCategory: string
): Promise<ToolApprovalResult> {
  const result = await createToolApproval(params)
  return {
    ...result,
    riskLevel,
    riskReason,
    riskCategory,
  }
}

/**
 * 创建工具审批请求
 */
export async function createToolApproval(params: CreateToolApprovalParams): Promise<ToolApprovalResult> {
  const { swarmSessionId, agentId, agentName, type, toolName, inputParams, description, workingDir } = params

  // 计算过期时间（审批请求过期时间，与命令执行超时时间无关）
  const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS)

  // 计算风险等级（用于前端展示）
  let riskLevel: RiskLevel = 'medium'
  let riskReason = ''
  let riskCategory = ''
  if (type === 'SHELL_EXEC' && typeof inputParams.command === 'string') {
    const risk = assessCommandRisk(inputParams.command)
    riskLevel = risk.level
    riskReason = risk.reason
    riskCategory = risk.category
  }

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
      risk_level: riskLevel,
      risk_reason: riskReason,
      risk_category: riskCategory,
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
      riskLevel,
      riskReason,
      riskCategory,
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
 * 等待用户审批（无超时，直到用户操作）
 */
export async function waitForApproval(
  approvalId: string,
  _timeoutMs?: number
): Promise<ToolApprovalResult> {
  const checkInterval = 500 // 每500ms检查一次

  while (true) {
    const approval = await prisma.toolApproval.findUnique({
      where: { id: approvalId },
    })

    if (!approval) {
      return {
        success: false,
        error: 'Approval request not found',
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

    if (approval.status === 'EXPIRED') {
      return {
        success: false,
        approvalId,
        status: 'EXPIRED',
        error: 'Approval request expired',
      }
    }

    // 等待一段时间再检查
    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }
}

/**
 * 执行命令（在获得审批后调用）
 */
export async function executeApprovedCommand(
  approvalId: string,
  swarmSessionId: string,
  agentId: string,
  _agentName: string
): Promise<string> {
  const { spawn } = await import('child_process')
  const pathModule = await import('path')
  const fsModule = await import('fs')

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
  const workingDir = inputParams.working_dir || pathModule.join(process.cwd(), 'session-workspaces', swarmSessionId)
  const timeoutSec = inputParams.timeout || 30
  const timeoutMs = timeoutSec * 1000

  // 确保工作目录存在，如果不存在则创建
  try {
    await fsModule.promises.mkdir(workingDir, { recursive: true })
  } catch {
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

  // 构建 PATH：虚拟环境 bin 目录优先，确保 python/pip 使用工作区隔离版本
  const venvEnvPath = await buildVenvEnvPath(swarmSessionId)
  const venvBin = await getSessionVenvBinPath(swarmSessionId)
  const envVars = {
    ...process.env,
    PATH: venvEnvPath,
    VIRTUAL_ENV: pathModule.join(workingDir, '.venv'),
    ...userEnvVars,
  }

  // 如果 venv bin 存在，在 PATH 中覆盖用户设置的 PATH
  if (fsModule.existsSync(venvBin)) {
    envVars.PATH = `${venvBin}${pathModule.delimiter}${userEnvVars.PATH || process.env.PATH || ''}`
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
        if (fsModule.existsSync(shell)) {
          return shell
        }
      }
      // 如果都找不到，使用系统默认的 PATH 中的 shell
      return platform === 'darwin' ? 'zsh' : 'bash'
    }

    const shellPath = detectShell()

    // 构建沙盒参数：根据平台自动选择 Seatbelt / Bubblewrap / 降级
    const commandPolicy = determineSandboxPolicy(command)
    const needsNet = commandPolicy === 'workspace-write-net'
    const sandboxPolicy: SandboxPolicy = resolveEffectivePolicy(swarmSessionId, needsNet)
    const sessionSandboxConfig = getSessionSandboxConfig(swarmSessionId)
    const writableRoots = [workingDir, ...sessionSandboxConfig.extraWritableRoots]
    // 如果 venv 目录在工作区外（通常不会），也加入可写列表
    const venvPath = pathModule.join(workingDir, '.venv')
    if (!venvPath.startsWith(workingDir)) {
      writableRoots.push(venvPath)
    }

    const sandboxArgs = buildSandboxedSpawnArgs({
      shellPath,
      command,
      cwd: workingDir,
      env: envVars,
      policy: sandboxPolicy,
      writableRoots,
    })

    if (sandboxArgs.sandboxed) {
      console.log(`[ToolApproval] Sandboxed execution (${sandboxArgs.capability.tool}, policy=${sandboxPolicy}): ${command.slice(0, 80)}`)
    }

    const child = spawn(sandboxArgs.command, sandboxArgs.args, {
      cwd: sandboxArgs.options.cwd,
      env: sandboxArgs.options.env as NodeJS.ProcessEnv,
    }) as ReturnType<typeof spawn>

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
