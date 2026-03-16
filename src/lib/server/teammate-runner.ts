import type { LLMMessage } from './llm/types'
import prisma from '@/lib/db'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { teammateTools } from './tools/teammate-tools'
import { handleTeammateReport } from './lead-orchestrator-tasks'
import { listAgentContextEntries } from './agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import {
  createInternalThread,
  sendInternalMessage,
  sendPeerToPeerMessage,
  broadcastToTeam,
  getTeamRoster,
} from './internal-bus'
import { runCognitiveLeadReEvaluation } from './cognitive-lead-runner'
import * as path from 'path'
import {
  createWorkspaceDirectory,
  listWorkspaceDirectory,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from './session-workspace'

/**
 * 运行 Teammate Agent Loop
 * 当 Lead 分配任务给 Teammate 时触发
 */
export async function runTeammateLoop(
  swarmSessionId: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // 1. 获取 Teammate 和 Task 信息
  const [teammate, task, session] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: { parent: true, subtasks: true },
    }),
    prisma.swarmSession.findUnique({ where: { id: swarmSessionId } }),
  ])

  if (!teammate || !task || !session) {
    console.error(`[TeammateRunner] Missing data: teammate=${!!teammate}, task=${!!task}, session=${!!session}`)
    return
  }

  // 2. Update statuses
  await Promise.all([
    prisma.agent.update({ where: { id: teammateId }, data: { status: 'BUSY' } }),
    prisma.teamLeadTask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    }),
  ])

  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: teammateId,
        name: teammate.name,
        status: 'busy',
        current_task_id: taskId,
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
        task_id: taskId,
        title: task.title,
        status: 'in_progress',
        assignee_id: teammateId,
        assignee_name: teammate.name,
        swarm_session_id: swarmSessionId,
        message: `${teammate.name} 开始执行任务: ${task.title}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // 3. Build system prompt
  const systemPrompt = buildTeammateSystemPrompt(teammate, task)

  // 4. Build context messages
  const contextMessages = await buildTeammateContextMessages(
    swarmSessionId,
    teammateId,
    task
  )

  // 5. Get lead agent ID
  const leadAgent = await prisma.agent.findFirst({
    where: { swarmSessionId, kind: 'LEAD' },
  })
  const leadAgentId = leadAgent?.id || session.leadAgentId || ''

  // 6. Create tool executor
  let taskCompleted = false

  const executeTool: ToolExecutor = async (name, input) => {
    switch (name) {
      case 'list_workspace_files': {
        const directoryPath = (input.directory_path as string) || ''
        const recursive = Boolean(input.recursive)
        const result = await listWorkspaceDirectory(swarmSessionId, directoryPath, recursive)
        return JSON.stringify({ success: true, ...result })
      }

      case 'read_workspace_file': {
        const relativePath = input.path as string
        try {
          const { file, extracted } = await readWorkspaceFile(swarmSessionId, relativePath)
          if (!extracted.success) {
            return JSON.stringify({
              success: false,
              path: relativePath,
              mime_type: file.mimeType,
              error: extracted.error || '无法读取文件内容',
              note: '请联系 Lead 提供可直接读取的纯文本、Markdown，或确认附件格式是否受支持；不要假装自己已经读过原文。',
            })
          }

          return JSON.stringify({
            success: true,
            path: relativePath,
            mime_type: file.mimeType,
            extraction_method: extracted.extractionMethod,
            content: (extracted.text || '').slice(0, 10000),
          })
        } catch (error) {
          return JSON.stringify({
            success: false,
            path: relativePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
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

        publishRealtimeMessage(
          {
            type: 'internal_message',
            payload: {
              agent_id: teammateId,
              agent_name: teammate.name,
              action: 'file_created',
              file_name: relativePath,
              file_id: fileRecord.id,
              swarm_session_id: swarmSessionId,
              message: `${teammate.name} ${name === 'create_workspace_file' ? '创建' : '更新'}了文件: ${relativePath}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({
          success: true,
          file_id: fileRecord.id,
          path: relativePath,
          mime_type: mimeType,
          size: fileRecord.size,
          operation: mode,
          url: `/api/files/${fileRecord.id}`,
        })
      }

      case 'report_task_completion': {
        taskCompleted = true
        const report = input.report as string
        const resultSummary = input.result_summary as string | undefined

        await handleTeammateReport(
          swarmSessionId,
          leadAgentId,
          teammateId,
          taskId,
          report,
          resultSummary
        )

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

        const msg = await sendInternalMessage({
          swarmSessionId,
          threadId: thread.id,
          senderAgentId: teammateId,
          recipientAgentId: leadAgentId,
          messageType: msgType,
          content,
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
              message: `${teammate.name} → Lead: ${content.slice(0, 100)}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({ success: true, message_id: msg.id })
      }

      case 'send_message_to_teammate': {
        const content = input.content as string
        const recipientId = input.teammate_id as string
        const msgType = (input.message_type as string) || 'coordination'

        const msg = await sendPeerToPeerMessage({
          swarmSessionId,
          senderAgentId: teammateId,
          recipientAgentId: recipientId,
          messageType: msgType,
          content,
        })

        return JSON.stringify({
          success: true,
          message_id: msg.id,
          recipient_id: recipientId,
        })
      }

      case 'broadcast_to_team': {
        const content = input.content as string
        const msgType = (input.message_type as string) || 'info'

        const result = await broadcastToTeam({
          swarmSessionId,
          senderAgentId: teammateId,
          messageType: msgType,
          content,
        })

        return JSON.stringify({
          success: true,
          thread_id: result.threadId,
          recipients_count: result.messageCount,
          recipient_ids: result.recipientIds,
        })
      }

      case 'get_team_roster': {
        const roster = await getTeamRoster(swarmSessionId, teammateId)
        return JSON.stringify({
          success: true,
          teammates: roster,
          count: roster.length,
        })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  // 7. Run agent loop
  try {
    const result = await runAgentLoop({
      systemPrompt,
      agentId: teammateId,
      agentName: teammate.name,
      swarmSessionId,
      tools: teammateTools,
      executeTool,
      contextMessages,
      maxIterations: 20,
      stopOnSuccessfulTools: ['report_task_completion'],
    })

    console.log(
      `[TeammateRunner][${teammate.name}] Loop completed: ${result.iterationsUsed} iterations, ${result.toolCallsMade} tool calls`
    )

    // Auto-complete task if teammate didn't explicitly call report_task_completion
    if (!taskCompleted) {
      await handleTeammateReport(
        swarmSessionId,
        leadAgentId,
        teammateId,
        taskId,
        result.finalText || '任务已处理完成',
        result.finalText?.slice(0, 200)
      )
    }

    // Trigger Lead re-evaluation (async, non-blocking)
    const userId = session.userId
    const report = taskCompleted
      ? (await prisma.teamLeadTask.findUnique({ where: { id: taskId } }))?.resultSummary || result.finalText
      : result.finalText || '任务已完成'

    triggerLeadReEvaluation(
      swarmSessionId,
      leadAgentId,
      userId,
      task.title,
      report || '任务已完成',
      teammateId,
      taskId
    ).catch(err => {
      console.error(`[TeammateRunner] Lead re-evaluation failed:`, err)
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[TeammateRunner][${teammate.name}] Fatal error:`, errMsg)

    // Mark task as failed
    await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        errorSummary: errMsg,
      },
    })

    await prisma.agent.update({
      where: { id: teammateId },
      data: { status: 'ERROR' },
    })

    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: {
          task_id: taskId,
          title: task.title,
          status: 'failed',
          assignee_id: teammateId,
          assignee_name: teammate.name,
          swarm_session_id: swarmSessionId,
          message: `任务失败: ${errMsg}`,
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )
  }
}

function buildTeammateSystemPrompt(
  teammate: { name: string; role: string; description: string | null; capabilities: string | null },
  task: { title: string; description: string | null }
): string {
  const caps = teammate.capabilities
    ? (() => { try { return JSON.parse(teammate.capabilities) } catch { return [] } })()
    : []

  return `你是 Swarm 团队的成员 **${teammate.name}**。

## 你的角色
- 角色：${teammate.role}
- 描述：${teammate.description || '团队成员'}
${caps.length > 0 ? `- 能力：${caps.join(', ')}` : ''}

## 当前任务
- 标题：${task.title}
- 描述：${task.description || '无详细描述'}

## 工作原则
1. **专注执行**：接到任务后直接开始工作，产出实际成果
2. **避免状态汇报**：不发送"正在分析""正在深入思考"等无实质内容的状态更新
3. **适时沟通**：仅在遇到阻碍、需要澄清或有重要发现时联系 Lead
4. **团队协作**：可使用 send_message_to_teammate 直接联系其他队友协作
5. **完成汇报**：使用 report_task_completion 提交结果

## 工具使用说明
- **list_workspace_files**：列出工作区中的文件和目录
- **create_workspace_directory**：创建目录
- **read_workspace_file**：读取文件内容
- **create_workspace_file / replace_workspace_file**：创建或替换文件
- **report_task_completion**：任务完成后必须调用
- **send_message_to_lead**：遇到困难时联系 Lead
- **send_message_to_teammate**：直接联系队友
- **broadcast_to_team**：向全队广播重要信息
- **get_team_roster**：查看团队成员列表

## 上下文压缩
- 标记为 [Previous: used {tool_name}] 的条目是已执行但结果被压缩的工具调用
- 遇到压缩后的上下文时，依据当前任务信息继续工作即可

## 禁止行为
- ❌ 调用工具汇报"正在分析"等状态
- ❌ 每完成一小步就发送消息
- ❌ 生成无意义的占位内容

## 正确做法
- ✅ 直接分析并产出结果
- ✅ 遇到实际问题时寻求帮助
- ✅ 任务完成后立即汇报`
}

async function buildTeammateContextMessages(
  swarmSessionId: string,
  teammateId: string,
  task: { title: string; description: string | null; id: string }
): Promise<LLMMessage[]> {
  const messages: LLMMessage[] = []

  // Get teammate's context entries
  const entries = await listAgentContextEntries(teammateId, 30)
  const chronological = [...entries].reverse()

  // Ensure tool_call/tool_result pairs are complete before processing
  const { ensureToolPairIntegrity } = await import('./context-compaction')
  const integrityChecked = ensureToolPairIntegrity(chronological.map(e => ({
    entryType: e.entryType,
    content: e.content,
    metadata: e.metadata as string | null,
  })))

  // Build a set of entry identifiers for quick lookup
  const checkedSet = new Set(integrityChecked.map(e => `${e.entryType}:${e.content.slice(0, 50)}`))

  for (const entry of chronological) {
    // Skip entries that were removed by integrity check
    const entryKey = `${entry.entryType}:${entry.content.slice(0, 50)}`
    if ((entry.entryType === 'tool_call' || entry.entryType === 'tool_result') && !checkedSet.has(entryKey)) {
      continue
    }

    const metadata = entry.metadata ? JSON.parse(entry.metadata as string) : null

    if (entry.entryType === 'task_assignment' || entry.entryType === 'system_bootstrap') {
      messages.push({
        role: 'user',
        content: `[系统] ${entry.content}`,
      })
    } else if (entry.entryType === 'assistant_response') {
      messages.push({ role: 'assistant', content: entry.content })
    } else if (entry.entryType === 'tool_call' && metadata?.toolUseId) {
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use' as const,
          id: metadata.toolUseId,
          name: metadata.toolName,
          input: metadata.toolInput || {},
        }],
      })
    } else if (entry.entryType === 'tool_result' && metadata?.toolUseId) {
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result' as const,
          tool_use_id: metadata.toolUseId,
          content: metadata.resultContent || entry.content,
          is_error: metadata.isError || false,
        }],
      })
    } else if (entry.entryType === 'progress_update') {
      messages.push({ role: 'user', content: `[进度更新] ${entry.content}` })
    }
  }

  const workspaceFiles = await listWorkspaceFiles(swarmSessionId)

  if (workspaceFiles.length > 0) {
    const fileInfo = workspaceFiles
      .map(file => `- ${file.relativePath}${file.sourceTaskId === task.id ? ' - 当前任务输出' : ''}`)
      .join('\n')
    messages.push({
      role: 'user',
      content: `[工作区文件]\n${fileInfo}\n\n如需查看目录，请使用 list_workspace_files；如需读取文件内容，请使用 read_workspace_file，并传入相对路径。`,
    })
  }

  // Current task instruction
  messages.push({
    role: 'user',
    content: `请开始执行任务: "${task.title}"\n\n${task.description || '请根据任务标题完成工作。'}\n\n完成后请使用 report_task_completion 工具提交报告。`,
  })

  // Ensure messages alternate
  return normalizeMessages(messages)
}

function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  if (messages.length === 0) {
    return [{ role: 'user', content: '请开始执行你的任务。' }]
  }

  const normalized: LLMMessage[] = []

  for (const msg of messages) {
    const last = normalized[normalized.length - 1]
    if (last && last.role === msg.role) {
      // Both are strings → merge
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content = `${last.content}\n\n${msg.content}`
      }
      // Both are arrays → concatenate
      else if (Array.isArray(last.content) && Array.isArray(msg.content)) {
        last.content = [...last.content, ...msg.content]
      }
      // Mixed: convert string to text block and merge into array
      else if (Array.isArray(last.content) && typeof msg.content === 'string') {
        last.content = [...last.content, { type: 'text' as const, text: msg.content }]
      } else if (typeof last.content === 'string' && Array.isArray(msg.content)) {
        last.content = [{ type: 'text' as const, text: last.content }, ...msg.content]
      }
    } else {
      normalized.push({ ...msg })
    }
  }

  if (normalized[0]?.role !== 'user') {
    normalized.unshift({ role: 'user', content: '你好，请开始工作。' })
  }

  return normalized
}

/**
 * 异步触发 Lead 重新评估
 */
async function triggerLeadReEvaluation(
  swarmSessionId: string,
  leadAgentId: string,
  userId: string,
  taskTitle: string,
  report: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // Small delay to let DB writes settle
  await new Promise(resolve => setTimeout(resolve, 1000))
  await runCognitiveLeadReEvaluation(swarmSessionId, leadAgentId, userId, taskTitle, report, teammateId, taskId)
}

function inferMimeType(filename: string): string {
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

