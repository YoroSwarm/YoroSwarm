import type { LLMMessage } from './llm/types'
import prisma from '@/lib/db'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { teammateTools } from './tools/teammate-tools'
import { handleTeammateReport } from './lead-orchestrator'
import { listAgentContextEntries } from './agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import {
  createInternalThread,
  sendInternalMessage,
  sendPeerToPeerMessage,
  broadcastToTeam,
  getTeamRoster,
} from './internal-bus'
import { runLeadReEvaluation } from './lead-runner'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { mkdir, writeFile as writeFileFs } from 'fs/promises'

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
      case 'write_artifact': {
        const artifact = await prisma.artifact.create({
          data: {
            swarmSessionId,
            ownerAgentId: teammateId,
            sourceTaskId: taskId,
            kind: (input.kind as string) || 'document',
            title: input.title as string,
            summary: (input.summary as string) || null,
            metadata: JSON.stringify({ content: input.content }),
          },
        })

        // Also save artifact content as a downloadable file
        const artFilename = `${(input.title as string).replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_')}.${getArtifactExtension(input.kind as string)}`
        const artMimeType = getArtifactMimeType(input.kind as string)
        const artContent = input.content as string
        const UPLOAD_DIR_ART = process.env.UPLOAD_DIR || './uploads'
        const artUniqueName = `${randomUUID()}${path.extname(artFilename)}`
        const artFilePath = path.join(UPLOAD_DIR_ART, artUniqueName)

        await mkdir(UPLOAD_DIR_ART, { recursive: true })
        await writeFileFs(artFilePath, artContent, 'utf-8')

        const artFileSession = await prisma.session.findFirst({
          where: { userId: session.userId, isActive: true },
        })

        const artFileRecord = await prisma.file.create({
          data: {
            filename: artUniqueName,
            originalName: artFilename,
            mimeType: artMimeType,
            size: Buffer.byteLength(artContent, 'utf-8'),
            path: artFilePath,
            sessionId: artFileSession?.id || '',
            swarmSessionId,
            userId: session.userId,
          },
        })

        // Link file to artifact
        await prisma.artifact.update({
          where: { id: artifact.id },
          data: { fileId: artFileRecord.id },
        })

        publishRealtimeMessage(
          {
            type: 'internal_message',
            payload: {
              agent_id: teammateId,
              agent_name: teammate.name,
              action: 'artifact_created',
              artifact_title: input.title,
              artifact_kind: input.kind,
              swarm_session_id: swarmSessionId,
              message: `${teammate.name} 创建了工件: ${input.title}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({
          success: true,
          artifact_id: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          file_id: artFileRecord.id,
        })
      }

      case 'write_file': {
        const filename = input.filename as string
        const content = input.content as string
        const mimeType = (input.mime_type as string) || inferMimeType(filename)

        const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
        const ext = path.extname(filename) || ''
        const uniqueName = `${randomUUID()}${ext}`
        const filePath = path.join(UPLOAD_DIR, uniqueName)

        await mkdir(UPLOAD_DIR, { recursive: true })
        await writeFileFs(filePath, content, 'utf-8')

        // Get the session to find userId
        const fileSession = await prisma.session.findFirst({
          where: { userId: session.userId, isActive: true },
        })

        const fileRecord = await prisma.file.create({
          data: {
            filename: uniqueName,
            originalName: filename,
            mimeType,
            size: Buffer.byteLength(content, 'utf-8'),
            path: filePath,
            sessionId: fileSession?.id || '',
            swarmSessionId,
            userId: session.userId,
          },
        })

        // Also create an artifact to link file to task
        await prisma.artifact.create({
          data: {
            swarmSessionId,
            ownerAgentId: teammateId,
            sourceTaskId: taskId,
            kind: 'generated_file',
            fileId: fileRecord.id,
            title: filename,
            summary: `由 ${teammate.name} 生成的文件`,
          },
        })

        publishRealtimeMessage(
          {
            type: 'internal_message',
            payload: {
              agent_id: teammateId,
              agent_name: teammate.name,
              action: 'file_created',
              file_name: filename,
              file_id: fileRecord.id,
              swarm_session_id: swarmSessionId,
              message: `${teammate.name} 创建了文件: ${filename}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({
          success: true,
          file_id: fileRecord.id,
          filename,
          url: `/api/files/${fileRecord.id}`,
          size: fileRecord.size,
        })
      }

      case 'read_file': {
        const fileId = input.file_id as string
        const file = await prisma.file.findUnique({ where: { id: fileId } })
        if (!file) {
          return JSON.stringify({ error: '文件不存在', file_id: fileId })
        }

        try {
          const filePath = path.resolve(file.path)
          const content = fs.readFileSync(filePath, 'utf-8')
          return JSON.stringify({
            success: true,
            filename: file.originalName,
            mime_type: file.mimeType,
            content: content.slice(0, 10000), // Limit content size
          })
        } catch {
          return JSON.stringify({
            success: true,
            filename: file.originalName,
            mime_type: file.mimeType,
            note: '文件内容无法直接读取（可能是二进制文件）',
          })
        }
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
      report || '任务已完成'
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
- 角色: ${teammate.role}
- 描述: ${teammate.description || '团队成员'}
${caps.length > 0 ? `- 能力: ${caps.join(', ')}` : ''}

## 当前任务
- 标题: ${task.title}
- 描述: ${task.description || '无详细描述'}

## 工作原则（重要）
1. **专注执行任务**：直接开始工作，产出实际成果
2. **避免空泛状态报告**：不要报告"正在分析"、"正在深入思考"等无意义的状态更新
3. **只在必要时沟通**：只有遇到阻碍、需要澄清或重要发现时才联系 Lead
4. **与队友协作**：可以使用 send_message_to_teammate 与其他队友直接沟通协作
5. **任务完成后必须汇报**：使用 report_task_completion 提交结果

## 工具使用指南
- **write_artifact**：创建文档、分析报告、代码等工件
- **write_file**：创建用户可下载的文件
- **read_file**：读取上传的文件内容
- **report_task_completion**：任务完成后的汇报（必须调用）
- **send_message_to_lead**：仅在遇到阻碍时联系 Lead
- **send_message_to_teammate**：与其他队友直接沟通
- **broadcast_to_team**：向所有队友广播重要信息
- **get_team_roster**：查看团队成员列表

## 禁止行为
- ❌ 不要调用工具报告"正在分析"、"正在处理"等状态
- ❌ 不要每完成一个小步骤就发送消息
- ❌ 不要生成无意义的占位内容

## 正确做法
- ✅ 直接分析并产出结果
- ✅ 遇到实际问题才寻求帮助
- ✅ 完成任务后立即汇报`
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

  for (const entry of chronological) {
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

  // Get task-related artifacts files
  const artifacts = await prisma.artifact.findMany({
    where: { sourceTaskId: task.id },
    include: { file: true },
  })

  // Get all session files (including user uploads)
  const sessionFiles = await prisma.file.findMany({
    where: { swarmSessionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // Combine artifact files and session files (avoid duplicates)
  const fileIdSet = new Set<string>()
  const allFiles: { id: string; originalName: string; description?: string }[] = []

  // Add artifact files first
  for (const a of artifacts) {
    if (a.file && !fileIdSet.has(a.file.id)) {
      fileIdSet.add(a.file.id)
      allFiles.push({
        id: a.file.id,
        originalName: a.file.originalName,
        description: `Artifact: ${a.title}`,
      })
    }
  }

  // Add session files
  for (const f of sessionFiles) {
    if (!fileIdSet.has(f.id)) {
      fileIdSet.add(f.id)
      allFiles.push({
        id: f.id,
        originalName: f.originalName,
      })
    }
  }

  if (allFiles.length > 0) {
    const fileInfo = allFiles
      .map(f => `- ${f.originalName} (文件ID: ${f.id})${f.description ? ` - ${f.description}` : ''}`)
      .join('\n')
    messages.push({
      role: 'user',
      content: `[可用文件列表]\n${fileInfo}\n\n如需读取文件内容，请使用 read_file 工具，传入上述文件ID。`,
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
  report: string
): Promise<void> {
  // Small delay to let DB writes settle
  await new Promise(resolve => setTimeout(resolve, 1000))
  await runLeadReEvaluation(swarmSessionId, leadAgentId, userId, taskTitle, report)
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

function getArtifactExtension(kind: string): string {
  switch (kind) {
    case 'code': return 'txt'
    case 'document': return 'md'
    case 'analysis': return 'md'
    case 'report': return 'md'
    case 'spreadsheet': return 'csv'
    case 'outline': return 'md'
    default: return 'txt'
  }
}

function getArtifactMimeType(kind: string): string {
  switch (kind) {
    case 'code': return 'text/plain'
    case 'spreadsheet': return 'text/csv'
    default: return 'text/markdown'
  }
}
