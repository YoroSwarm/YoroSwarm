/**
 * Teammate 工具执行器
 * 
 * 从 cognitive-teammate-runner.ts 提取的工具处理逻辑
 */

import type { ToolExecutor } from './agent-loop'
import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import {
  createWorkspaceDirectory,
  listWorkspaceDirectory,
  readWorkspaceFile,
  resolveWorkspaceAbsolutePath,
  saveWorkspaceFile,
} from './session-workspace'
import {
  sendInternalMessage,
  sendPeerToPeerMessage,
  broadcastToTeam,
  createInternalThread,
} from './internal-bus'
import {
  createToolApproval,
  waitForApproval,
  executeApprovedCommand,
} from './tool-approval'
import * as path from 'path'
import { readFile, writeFile } from 'fs/promises'

// 持久化文件读取缓存
const teammateReadFileCache = new Map<string, Map<string, string>>()

// ──────────────────────────────────────────────
// Runtime Control 构建器
// ──────────────────────────────────────────────

export function buildTeammateToLeadRuntimeControl(messageType: string, taskId: string | null) {
  const workUnitKey = taskId ? `task:${taskId}` : undefined

  switch (messageType) {
    case 'blocking_issue':
    case 'critical_update':
      return {
        plane: 'control',
        interruption: 'hard',
        workUnitKey,
        supersedesPending: true,
      }
    case 'clarification_request':
    case 'resource_request':
      return {
        plane: 'control',
        interruption: 'soft',
        workUnitKey,
        supersedesPending: true,
      }
    case 'task_complete':
      return {
        plane: 'control',
        interruption: 'soft',
        workUnitKey,
        supersedesPending: true,
      }
    default:
      return {
        plane: 'control',
        interruption: 'none',
        workUnitKey,
      }
  }
}

function buildPeerRuntimeControl(messageType: string, taskId: string | null) {
  const workUnitKey = taskId ? `task:${taskId}` : undefined

  switch (messageType) {
    case 'question':
    case 'response':
    case 'coordination':
      return {
        plane: 'control',
        interruption: 'soft',
        workUnitKey,
        supersedesPending: true,
      }
    case 'info_share':
      return {
        plane: 'work',
        interruption: 'none',
        workUnitKey,
      }
    default:
      return {
        plane: 'control',
        interruption: 'soft',
        workUnitKey,
      }
  }
}

function buildBroadcastRuntimeControl(messageType: string, taskId: string | null) {
  const workUnitKey = taskId ? `task:${taskId}` : undefined

  switch (messageType) {
    case 'warning':
      return {
        plane: 'control',
        interruption: 'soft',
        workUnitKey,
      }
    default:
      return {
        plane: 'work',
        interruption: 'none',
        workUnitKey,
        supersedesPending: true,
      }
  }
}

// ──────────────────────────────────────────────
// 任务完成与状态发布
// ──────────────────────────────────────────────

export interface FinalizeTaskInput {
  swarmSessionId: string
  teammateId: string
  teammateName: string
  leadAgentId: string
  taskId: string
  taskTitle: string
  report: string
  resultSummary?: string
}

export async function finalizeTaskCompletion(
  input: FinalizeTaskInput,
  deps: {
    getTeammateProcessor: (swarmSessionId: string, teammateId: string) => { markTaskCompleted: () => void } | undefined
  }
) {
  const existingTask = await prisma.teamLeadTask.findUnique({ where: { id: input.taskId } })
  if (!existingTask || existingTask.status === 'COMPLETED') {
    return { success: true, alreadyCompleted: true }
  }

  await prisma.teamLeadTask.update({
    where: { id: input.taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      resultSummary: input.resultSummary || input.report.slice(0, 500),
    },
  })

  // 设置为 IDLE 状态，让空闲检查机制决定是否处理下一个任务
  await prisma.agent.update({
    where: { id: input.teammateId },
    data: { status: 'IDLE' },
  })

  // 写入共享知识库，供下游任务引用
  const { publishTaskResult } = await import('./shared-knowledge')
  await publishTaskResult({
    swarmSessionId: input.swarmSessionId,
    taskId: input.taskId,
    agentId: input.teammateId,
    taskTitle: input.taskTitle,
    report: input.report,
    resultSummary: input.resultSummary,
  })

  const processor = deps.getTeammateProcessor(input.swarmSessionId, input.teammateId)
  processor?.markTaskCompleted()

  publishStatusUpdate(
    input.swarmSessionId,
    { id: input.teammateId, name: input.teammateName },
    { id: input.taskId, title: input.taskTitle },
    'idle'
  )

  const thread = await createInternalThread({
    swarmSessionId: input.swarmSessionId,
    threadType: 'task_completion',
    subject: `任务完成: ${input.taskTitle}`,
    relatedTaskId: input.taskId,
  })

  await sendInternalMessage({
    swarmSessionId: input.swarmSessionId,
    threadId: thread.id,
    senderAgentId: input.teammateId,
    recipientAgentId: input.leadAgentId,
    messageType: 'task_complete',
    content: input.report,
    metadata: {
      taskId: input.taskId,
      resultSummary: input.resultSummary,
      runtimeControl: buildTeammateToLeadRuntimeControl('task_complete', input.taskId),
    },
  })

  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: input.taskId,
        title: input.taskTitle,
        status: 'completed',
        assignee_id: input.teammateId,
        assignee_name: input.teammateName,
        swarm_session_id: input.swarmSessionId,
        message: `${input.teammateName} 完成了任务: ${input.taskTitle}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: input.swarmSessionId }
  )

  return { success: true, alreadyCompleted: false }
}

export function publishStatusUpdate(
  swarmSessionId: string,
  teammate: { id: string; name: string },
  task: { id: string; title: string },
  status: 'busy' | 'idle'
): void {
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: teammate.id,
        name: teammate.name,
        status,
        current_task_id: task.id,
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: task.id,
        title: task.title,
        status: status === 'busy' ? 'in_progress' : 'completed',
        assignee_id: teammate.id,
        assignee_name: teammate.name,
        swarm_session_id: swarmSessionId,
        message: `${teammate.name} ${status === 'busy' ? '开始' : '完成'}任务: ${task.title}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )
}

// ──────────────────────────────────────────────
// 工具执行器
// ──────────────────────────────────────────────

export function buildTeammateToolExecutor(
  swarmSessionId: string,
  teammateId: string,
  getCurrentTaskId: () => string | null,
  leadAgentId: string,
  teammate: { name: string },
  _session: { userId: string },
  deps: {
    getTeammateProcessor: (swarmSessionId: string, teammateId: string) => { markTaskCompleted: () => void } | undefined
  }
): ToolExecutor {
  const toolCache = new Map<string, string>()
  const persistentReadCacheKey = `${swarmSessionId}:${teammateId}`
  const persistentReadCache = teammateReadFileCache.get(persistentReadCacheKey) || new Map<string, string>()
  teammateReadFileCache.set(persistentReadCacheKey, persistentReadCache)

  return async (name: string, input: Record<string, unknown>) => {
    const taskId = getCurrentTaskId()
    const task = taskId
      ? await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
      : null

    const requiresActiveTask = new Set(['list_workspace_files', 'create_workspace_directory', 'read_workspace_file', 'create_workspace_file', 'replace_workspace_file', 'report_task_completion'])
    if (requiresActiveTask.has(name) && (!taskId || !task || task.status !== 'IN_PROGRESS')) {
      return JSON.stringify({ success: false, error: '当前没有可执行的活跃任务' })
    }

    switch (name) {
      case 'list_workspace_files': {
        const directoryPath = (input.directory_path as string) || ''
        const recursive = Boolean(input.recursive)
        return JSON.stringify({ success: true, ...(await listWorkspaceDirectory(swarmSessionId, directoryPath, recursive)) })
      }

      case 'create_workspace_directory': {
        const relativePath = input.path as string
        const result = await createWorkspaceDirectory(swarmSessionId, relativePath)
        return JSON.stringify({ success: true, path: result.relativePath, kind: 'directory' })
      }

      case 'create_workspace_file':
      case 'replace_workspace_file': {
        const relativePath = input.path as string
        const content = input.content as string
        const mimeType = (input.mime_type as string) || inferMimeType(relativePath)
        const mode = name === 'create_workspace_file' ? 'create' : 'replace'
        const fileRecord = await saveWorkspaceFile({
          swarmSessionId,
          relativePath,
          content,
          mimeType,
          mode,
          metadata: {
            sourceTaskId: taskId,
            sourceAgentId: teammateId,
            kind: 'agent_output',
          },
        })

        publishRealtimeMessage({
          type: 'internal_message',
          payload: {
            agent_id: teammateId,
            agent_name: teammate.name,
            action: 'file_created',
            file_id: fileRecord.id,
            file_name: relativePath,
            swarm_session_id: swarmSessionId,
            timestamp: new Date().toISOString(),
          },
        }, { sessionId: swarmSessionId })

        return JSON.stringify({ success: true, file_id: fileRecord.id, path: relativePath, mime_type: mimeType, size: fileRecord.size, operation: mode, url: `/api/files/${fileRecord.id}` })
      }

      case 'read_workspace_file': {
        const filePath = input.path as string
        const cacheKey = `read_workspace_file:${filePath}`
        const cached = toolCache.get(cacheKey)
        if (cached) return cached

        const persistentCached = persistentReadCache.get(filePath)
        if (persistentCached) {
          toolCache.set(cacheKey, persistentCached)
          return persistentCached
        }

        const result = await handleReadWorkspaceFile(swarmSessionId, input)
        toolCache.set(cacheKey, result)
        persistentReadCache.set(filePath, result)
        return result
      }

      case 'replace_in_file': {
        const relativePath = input.path as string
        const replacements = input.replacements as Array<{ old_str: string; new_str: string }>

        if (!replacements || !Array.isArray(replacements) || replacements.length === 0) {
          return JSON.stringify({ success: false, error: 'replacements 数组不能为空' })
        }

        const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, relativePath)
        let content: string
        try {
          content = await readFile(resolved.absolutePath, 'utf-8')
        } catch {
          return JSON.stringify({ success: false, error: `文件不存在: ${relativePath}` })
        }

        const results: Array<{ index: number; status: 'ok' | 'not_found' | 'ambiguous'; old_str: string; count?: number }> = []
        let modified = content

        for (let i = 0; i < replacements.length; i++) {
          const { old_str, new_str } = replacements[i]

          // Empty old_str means insert at beginning
          if (old_str === '') {
            modified = new_str + modified
            results.push({ index: i, status: 'ok', old_str: '(insert at start)' })
            continue
          }

          const occurrences = modified.split(old_str).length - 1
          if (occurrences === 0) {
            results.push({ index: i, status: 'not_found', old_str: old_str.slice(0, 80) })
          } else if (occurrences > 1) {
            // Replace only the first occurrence to be safe, but warn
            modified = modified.replace(old_str, new_str)
            results.push({ index: i, status: 'ambiguous', old_str: old_str.slice(0, 80), count: occurrences })
          } else {
            modified = modified.replace(old_str, new_str)
            results.push({ index: i, status: 'ok', old_str: old_str.slice(0, 80) })
          }
        }

        if (modified === content) {
          return JSON.stringify({ success: false, error: '文件内容未发生变化', results })
        }

        await writeFile(resolved.absolutePath, modified, 'utf-8')

        // Invalidate read cache for this file
        toolCache.delete(`read_workspace_file:${relativePath}`)
        persistentReadCache.delete(relativePath)

        // Also update the DB record if it exists
        const mimeType = inferMimeType(relativePath)
        await saveWorkspaceFile({
          swarmSessionId,
          relativePath,
          content: modified,
          mimeType,
          mode: 'replace',
          metadata: {
            sourceTaskId: taskId,
            sourceAgentId: teammateId,
            kind: 'agent_output',
          },
        })

        publishRealtimeMessage({
          type: 'internal_message',
          payload: {
            agent_id: teammateId,
            agent_name: teammate.name,
            action: 'file_edited',
            file_name: relativePath,
            swarm_session_id: swarmSessionId,
            replacements_count: replacements.length,
            timestamp: new Date().toISOString(),
          },
        }, { sessionId: swarmSessionId })

        const succeeded = results.filter(r => r.status === 'ok' || r.status === 'ambiguous').length
        const failed = results.filter(r => r.status === 'not_found').length

        return JSON.stringify({
          success: failed === 0,
          path: relativePath,
          total: replacements.length,
          succeeded,
          failed,
          results,
        })
      }

      case 'report_task_completion': {
        if (!taskId || !task || task.status !== 'IN_PROGRESS') {
          return JSON.stringify({ success: false, error: '当前没有可完成的活跃任务' })
        }

        const report = input.report as string
        const resultSummary = input.result_summary as string | undefined

        await finalizeTaskCompletion({
          swarmSessionId,
          teammateId,
          teammateName: teammate.name,
          leadAgentId,
          taskId,
          taskTitle: task.title,
          report,
          resultSummary,
        }, deps)

        return JSON.stringify({ success: true, message: '任务完成汇报已提交' })
      }

      case 'send_message_to_lead': {
        const content = input.content as string
        const msgType = (input.message_type as string) || 'progress_update'

        const thread = await prisma.internalThread.findFirst({
          where: { swarmSessionId, threadType: 'lead_teammate' },
        }) || await createInternalThread({
          swarmSessionId,
          threadType: 'lead_teammate',
          subject: `${teammate.name} 与 Lead 的沟通`,
        })

        await sendInternalMessage({
          swarmSessionId,
          threadId: thread.id,
          senderAgentId: teammateId,
          recipientAgentId: leadAgentId,
          messageType: msgType,
          content,
          metadata: {
            taskId: taskId || undefined,
            runtimeControl: buildTeammateToLeadRuntimeControl(msgType, taskId),
          },
        })

        publishRealtimeMessage(
          {
            type: 'internal_message',
            payload: {
              agent_id: teammateId,
              agent_name: teammate.name,
              action: 'message_sent',
              recipient: 'Lead',
              content: content.slice(0, 200),
              swarm_session_id: swarmSessionId,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({ success: true })
      }

      case 'send_message_to_teammate': {
        const content = input.content as string
        const recipientId = input.teammate_id as string
        const msgType = (input.message_type as string) || 'coordination'

        await sendPeerToPeerMessage({
          swarmSessionId,
          senderAgentId: teammateId,
          recipientAgentId: recipientId,
          messageType: msgType,
          content,
          metadata: {
            taskId: taskId || undefined,
            runtimeControl: buildPeerRuntimeControl(msgType, taskId),
          },
        })

        return JSON.stringify({ success: true, recipient_id: recipientId })
      }

      case 'broadcast_to_team': {
        const content = input.content as string
        const msgType = (input.message_type as string) || 'info'

        const result = await broadcastToTeam({
          swarmSessionId,
          senderAgentId: teammateId,
          messageType: msgType,
          content,
          metadata: {
            taskId: taskId || undefined,
            runtimeControl: buildBroadcastRuntimeControl(msgType, taskId),
          },
        })

        return JSON.stringify({
          success: true,
          recipients_count: result.messageCount,
        })
      }

      case 'get_team_roster': {
        const cacheKey = 'get_team_roster'
        const cached = toolCache.get(cacheKey)
        if (cached) return cached

        const { getTeamRoster } = await import('./internal-bus')
        const roster = await getTeamRoster(swarmSessionId, teammateId)
        const result = JSON.stringify({
          success: true,
          teammates: roster,
          count: roster.length,
        })
        toolCache.set(cacheKey, result)
        return result
      }

      case 'shell_exec': {
        const command = input.command as string
        const description = input.description as string
        const workingDir = input.working_dir as string | undefined
        const timeout = input.timeout as number | undefined

        // 创建审批请求（timeout 存储在 inputParams 中，审批通过后再使用）
        const approvalResult = await createToolApproval({
          swarmSessionId,
          agentId: teammateId,
          agentName: teammate.name,
          type: 'SHELL_EXEC',
          toolName: 'shell_exec',
          inputParams: { command, working_dir: workingDir, timeout },
          description,
          workingDir,
        })

        if (!approvalResult.success || !approvalResult.approvalId) {
          return JSON.stringify({
            success: false,
            error: approvalResult.error || 'Failed to create approval request',
          })
        }

        // 等待用户审批（等待时间不计入超时）
        const waitResult = await waitForApproval(approvalResult.approvalId)

        if (waitResult.success && waitResult.status === 'APPROVED') {
          // 执行命令（超时时间从现在开始计算）
          try {
            const result = await executeApprovedCommand(
              approvalResult.approvalId,
              swarmSessionId,
              teammateId,
              teammate.name
            )
            return JSON.stringify({
              success: true,
              approval_id: approvalResult.approvalId,
              output: result.slice(0, 10000), // 限制返回大小
            })
          } catch (execError) {
            return JSON.stringify({
              success: false,
              approval_id: approvalResult.approvalId,
              error: execError instanceof Error ? execError.message : 'Command execution failed',
            })
          }
        } else {
          // 用户拒绝或超时
          return JSON.stringify({
            success: false,
            approval_id: approvalResult.approvalId,
            status: waitResult.status,
            error: waitResult.error || 'Command execution was not approved',
          })
        }
      }

      case 'save_progress':
        return JSON.stringify({
          success: true,
          saved_at: new Date().toISOString(),
          progress: input.progress,
        })

      case 'resume_work':
        return JSON.stringify({
          success: true,
          resumed: true,
        })

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}

// ──────────────────────────────────────────────
// 辅助函数
// ──────────────────────────────────────────────

async function handleReadWorkspaceFile(
  swarmSessionId: string,
  input: Record<string, unknown>
): Promise<string> {
  const filePath = input.path as string

  try {
    const { file, extracted } = await readWorkspaceFile(swarmSessionId, filePath)
    if (!extracted.success) {
      return JSON.stringify({
        success: false,
        path: filePath,
        mime_type: file.mimeType,
        error: extracted.error || '无法读取文件内容',
        note: '请联系 Lead 提供可直接读取的纯文本、Markdown，或确认附件格式是否受支持；不要假装自己已经读过原文。',
      })
    }

    return JSON.stringify({
      success: true,
      path: filePath,
      mime_type: file.mimeType,
      extraction_method: extracted.extractionMethod,
      content: (extracted.text || '').slice(0, 10000),
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.rb': 'text/x-ruby',
    '.php': 'text/x-php',
    '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.sql': 'text/x-sql',
    '.r': 'text/x-r',
    '.swift': 'text/x-swift',
    '.kt': 'text/x-kotlin',
    '.tex': 'text/x-latex',
    '.log': 'text/plain',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 清理指定会话和 agent 的文件读取缓存
 * 用于会话删除或 agent 清理时释放内存
 */
export function clearTeammateReadFileCache(swarmSessionId: string, teammateId: string): void {
  const key = `${swarmSessionId}:${teammateId}`
  teammateReadFileCache.delete(key)
}

/**
 * 清理指定会话的所有文件读取缓存
 * 用于会话删除时释放所有相关缓存
 */
export function clearSessionReadFileCache(swarmSessionId: string): void {
  for (const key of teammateReadFileCache.keys()) {
    if (key.startsWith(`${swarmSessionId}:`)) {
      teammateReadFileCache.delete(key)
    }
  }
}
