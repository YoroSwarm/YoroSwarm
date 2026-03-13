import type { LLMMessage } from './llm/types'
import prisma from '@/lib/db'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { teammateTools } from './tools/teammate-tools'
import { listAgentContextEntries, appendAgentContextEntry } from './agent-context'
import { handleTeammateReport, sendToTeammate } from './lead-orchestrator'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { transitionTaskStatus } from './task-orchestrator'
import { createInternalThread, sendInternalMessage } from './internal-bus'
import { runLeadReEvaluation } from './lead-runner'
import * as fs from 'fs'
import * as path from 'path'

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

      case 'update_task_progress': {
        const desc = input.progress_description as string

        await appendAgentContextEntry({
          swarmSessionId,
          agentId: teammateId,
          sourceType: 'task',
          sourceId: taskId,
          entryType: 'progress_update',
          content: desc,
        })

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
              message: `${teammate.name}: ${desc}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return JSON.stringify({ success: true })
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

## 工作规则
1. 专注于你被分配的任务，认真完成它
2. 如果需要创建文档、代码或其他产出物，使用 write_artifact 工具
3. 可以使用 update_task_progress 报告进展
4. 可以使用 send_message_to_lead 与 Lead 沟通（如遇到问题或需要更多信息）
5. 完成任务后，**必须**使用 report_task_completion 工具汇报结果
6. 如果任务涉及文件，使用 read_file 工具读取文件内容

## 输出要求
- 产出高质量的工作成果
- 报告要简洁但全面
- 如果无法完成任务，在报告中说明原因`
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
    if (entry.entryType === 'task_assignment' || entry.entryType === 'system_bootstrap') {
      messages.push({
        role: 'user',
        content: `[系统] ${entry.content}`,
      })
    } else if (entry.entryType === 'assistant_response') {
      messages.push({ role: 'assistant', content: entry.content })
    }
  }

  // Get task-related files
  const artifacts = await prisma.artifact.findMany({
    where: { sourceTaskId: task.id },
    include: { file: true },
  })

  if (artifacts.length > 0) {
    const fileInfo = artifacts
      .filter(a => a.file)
      .map(a => `- ${a.file!.originalName} (ID: ${a.file!.id})`)
      .join('\n')
    if (fileInfo) {
      messages.push({
        role: 'user',
        content: `[任务附件]\n${fileInfo}\n\n你可以使用 read_file 工具读取这些文件。`,
      })
    }
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
      const lastContent = typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
      const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      last.content = `${lastContent}\n\n${msgContent}`
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
