/**
 * 认知收件箱架构 - Teammate Runner
 * 
 * 创新点：
 * 1. Teammate也有自己的"收件箱"，可以接收Lead的消息、队友的消息
 * 2. 在执行任务时，Teammate可以被打断处理更紧急的事情
 * 3. 支持协作：Teammate可以主动发消息给其他队友
 * 4. 任务完成后，通过收件箱通知Lead，而不是直接调用
 */

import type { LLMMessage, ToolDefinition } from './llm/types'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { teammateTools } from './tools/teammate-tools'
import { listAgentContextEntries } from './agent-context'
import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { extractFileText } from './file-text-extractor'

// 认知收件箱
import {
  initCognitiveEngine,
  deliverMessage,
  startAttentionLoop,
  updateWorkContext,
  type InboxMessage,
  type CurrentWorkContext,
} from './cognitive-inbox'

// 内部通信
import {
  sendInternalMessage,
  sendPeerToPeerMessage,
  broadcastToTeam,
  createInternalThread,
} from './internal-bus'

// 文件处理
import * as path from 'path'
import { randomUUID } from 'crypto'
import { mkdir, writeFile as writeFileFs } from 'fs/promises'

const TEAMMATE_SYSTEM_PROMPT_TEMPLATE = `你是 Swarm 团队的成员 **{{name}}**。

## 你的角色
- 角色: {{role}}
- 描述: {{description}}
{{capabilities}}

## 当前任务
{{currentTask}}

## 工作原则（重要）
1. **专注执行任务**：直接开始工作，产出实际成果
2. **避免空泛状态报告**：不要报告"正在分析"等无意义的状态更新
3. **只在必要时沟通**：
   - 遇到阻碍或需要澄清 → 联系 Lead
   - 需要与其他队友协作 → 直接联系队友
   - 任务完成后 → 必须汇报
4. **可以被打断**：你可能会在任务中收到新消息（如Lead的新指示、队友的求助），评估优先级后决定如何处理

## 中断与恢复
- 如果收到更高优先级的消息，你可以：
  - 使用 save_progress 保存当前进度
  - 处理新消息
  - 使用 resume_work 恢复之前的工作
- 任务通常应该连续完成，但如果Lead明确要求你处理其他事情，请遵从

## 工具使用指南
- **write_artifact**：创建文档、代码等工件
- **write_file**：创建用户可下载的文件
- **read_file**：读取上传的文件内容
- **report_task_completion**：任务完成后的汇报（必须调用）
- **send_message_to_lead**：向 Lead 发送消息或求助
- **send_message_to_teammate**：与其他队友直接沟通协作
- **broadcast_to_team**：向所有队友广播重要信息
- **get_team_roster**：查看团队成员列表
- **save_progress / resume_work**：保存和恢复工作进度

## 禁止行为
- ❌ 不要调用工具报告"正在分析"等状态
- ❌ 不要每完成一个小步骤就发送消息
- ❌ 不要生成无意义的占位内容
- ❌ 不要为了礼貌回应 welcome/team_update 之类的低优先级广播
- ❌ 不要在同一轮里反复调用 get_team_roster 或重复读取同一个文件
- ❌ 在没有活跃任务时，不要因为旧的 task_assignment、coordination 或完成后的补充消息再次开始产出文档、读文件或重复汇报

## 正确做法
- ✅ 直接分析并产出结果
- ✅ 遇到实际问题才寻求帮助
- ✅ 完成任务后立即汇报`

interface TeammateProcessor {
  cleanup: () => void
  isTaskActive: () => boolean
  getCurrentTaskId: () => string | null
  assignTask: (taskId: string) => Promise<void>
  markTaskCompleted: () => void
  sendMessageToTeammate: (senderId: string, content: string) => Promise<void>
  sendMessageFromLead: (content: string) => Promise<void>
}

// 存储每个Teammate的处理器
const teammateProcessors = new Map<string, TeammateProcessor>()

interface TeammateTaskRuntime {
  currentTaskId: string | null
  isTaskCompleted: boolean
  isTaskActive: boolean
}

async function ensureCognitiveTeammateProcessor(
  swarmSessionId: string,
  teammateId: string,
  leadAgentId: string
): Promise<TeammateProcessor> {
  const key = `${swarmSessionId}:${teammateId}`
  const existing = teammateProcessors.get(key)
  if (existing) {
    return existing
  }

  const teammate = await prisma.agent.findUnique({ where: { id: teammateId } })
  if (!teammate) {
    throw new Error(`Teammate not found: ${teammateId}`)
  }

  const taskRuntime: TeammateTaskRuntime = {
    currentTaskId: null,
    isTaskCompleted: false,
    isTaskActive: false,
  }

  await initCognitiveEngine({
    agentId: teammateId,
    swarmSessionId,
    config: {
      batchingStrategy: 'time',
      batchTimeWindowMs: 1000,
      batchMaxCount: 2,
    },
  })

  const cleanupAttentionLoop = await startAttentionLoop(swarmSessionId, teammateId, {
    llmConfig: {
      systemPrompt: buildTeammateSystemPrompt(teammate, null),
      agentName: teammate.name,
      tools: [...teammateTools, ...progressTools],
      executeTool: buildTeammateToolExecutor(
        swarmSessionId,
        teammateId,
        () => taskRuntime.currentTaskId,
        leadAgentId,
        teammate,
        { userId: '' }
      ),
    },
    onProcessMessages: async (messages, context) => {
      await processTeammateMessages(
        swarmSessionId,
        teammateId,
        teammate,
        leadAgentId,
        messages,
        context,
        taskRuntime,
        (completed) => { taskRuntime.isTaskCompleted = completed }
      )
    },
    checkIntervalMs: 300,
  })

  const processor: TeammateProcessor = {
    cleanup: () => {
      taskRuntime.isTaskActive = false
      cleanupAttentionLoop()
    },
    isTaskActive: () => taskRuntime.isTaskActive && !taskRuntime.isTaskCompleted,
    getCurrentTaskId: () => taskRuntime.currentTaskId,
    assignTask: async (taskId: string) => {
      taskRuntime.currentTaskId = taskId
      taskRuntime.isTaskCompleted = false
      taskRuntime.isTaskActive = true
    },
    markTaskCompleted: () => {
      taskRuntime.isTaskCompleted = true
      taskRuntime.isTaskActive = false
      taskRuntime.currentTaskId = null
    },
    sendMessageToTeammate: async (senderId: string, content: string) => {
      const sender = await prisma.agent.findUnique({ where: { id: senderId } })
      await deliverMessage(swarmSessionId, teammateId, {
        source: 'teammate',
        senderId,
        senderName: sender?.name || 'Teammate',
        type: 'coordination',
        content,
        swarmSessionId,
        agentId: teammateId,
      })
    },
    sendMessageFromLead: async (content: string) => {
      await deliverMessage(swarmSessionId, teammateId, {
        source: 'teammate',
        senderId: leadAgentId,
        senderName: 'Lead',
        type: 'direct_message',
        content,
        swarmSessionId,
        agentId: teammateId,
      })
    },
  }

  teammateProcessors.set(key, processor)
  return processor
}

export async function initCognitiveTeammate(
  swarmSessionId: string,
  teammateId: string,
  leadAgentId: string
): Promise<void> {
  await ensureCognitiveTeammateProcessor(swarmSessionId, teammateId, leadAgentId)
}

/**
 * 运行认知Teammate Loop
 * 
 * 这是核心创新：Teammate有自己的收件箱，可以：
 * 1. 接收并响应Lead的消息
 * 2. 接收并响应队友的消息
 * 3. 在任务执行中被打断处理紧急事务
 */
export async function runCognitiveTeammateLoop(
  swarmSessionId: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // 获取基本信息
  const [teammate, task, session, leadAgent] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({
      where: { id: taskId },
      include: { parent: true, subtasks: true },
    }),
    prisma.swarmSession.findUnique({ where: { id: swarmSessionId } }),
    prisma.agent.findFirst({ where: { swarmSessionId, kind: 'LEAD' } }),
  ])

  if (!teammate || !task || !session) {
    console.error(`[CognitiveTeammateRunner] Missing data`)
    return
  }

  const leadAgentId = leadAgent?.id || session.leadAgentId || ''
  const processor = await ensureCognitiveTeammateProcessor(swarmSessionId, teammateId, leadAgentId)

  const currentTaskId = processor.getCurrentTaskId()
  if (processor.isTaskActive() && currentTaskId && currentTaskId !== taskId) {
    throw new Error(`Teammate ${teammateId} is already executing task ${currentTaskId}`)
  }

  await processor.assignTask(taskId)

  // 更新状态
  await Promise.all([
    prisma.agent.update({ where: { id: teammateId }, data: { status: 'BUSY' } }),
    prisma.teamLeadTask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    }),
  ])

  // 发布状态更新
  publishStatusUpdate(swarmSessionId, teammate, task, 'busy')

  // 投递初始任务消息到收件箱
  await deliverMessage(swarmSessionId, teammateId, {
    source: 'system',
    senderId: 'system',
    senderName: 'System',
    type: 'task_assignment',
    content: `你的任务是: ${task.title}\n\n${task.description || '请根据任务标题完成工作。'}\n\n完成后请使用 report_task_completion 工具提交报告。`,
    metadata: { taskId, isInitialTask: true },
    swarmSessionId,
    agentId: teammateId,
  })

  // 等待任务完成（轮询检查）
  await waitForTaskCompletion(() => !processor.isTaskActive(), 100)

  console.log(`[CognitiveTeammateRunner] Task completed for ${teammate.name}`)
}

/**
 * 处理Teammate收件箱中的消息
 */
async function processTeammateMessages(
  swarmSessionId: string,
  teammateId: string,
  teammate: { name: string; role: string; description: string | null; capabilities: string | null },
  leadAgentId: string,
  messages: InboxMessage[],
  context: CurrentWorkContext,
  taskRuntime: TeammateTaskRuntime,
  onTaskCompleted: (completed: boolean) => void
): Promise<void> {
  const taskId = taskRuntime.currentTaskId
  const task = taskId
    ? await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
    : null

  const activeTaskId = task && task.status === 'IN_PROGRESS' ? task.id : null
  const actionableMessages = messages.filter((message) => {
    const messageTaskId = typeof message.metadata?.taskId === 'string' ? message.metadata.taskId : null

    if (!activeTaskId) {
      return message.type !== 'task_assignment'
    }

    if (!messageTaskId) {
      return true
    }

    return messageTaskId === activeTaskId
  })

  if (actionableMessages.length === 0) {
    return
  }

  // 构建消息摘要
  const messageSummary = actionableMessages.map(m => {
    const time = Math.round((Date.now() - m.receivedAt.getTime()) / 1000)
    return `[${m.type}] 来自 ${m.senderName} (${time}秒前): ${m.content.slice(0, 200)}`
  }).join('\n---\n')

  // 获取上下文消息
  const contextMessages = await buildTeammateContextMessages(
    swarmSessionId,
    teammateId,
    taskId,
    messageSummary
  )

  // 标记所有消息为处理中
  for (const msg of actionableMessages) {
    updateWorkContext(swarmSessionId, teammateId, {
      type: msg.type === 'task_assignment' ? 'executing_task' : 'processing_messages',
      description: `处理来自 ${msg.senderName} 的消息`,
      progress: 50,
    })
  }

  // 执行LLM循环
  const result = await runAgentLoop({
    systemPrompt: buildTeammateSystemPrompt(teammate, task),
    agentId: teammateId,
    agentName: teammate.name,
    swarmSessionId,
    tools: [...teammateTools, ...progressTools],
    executeTool: buildTeammateToolExecutor(
      swarmSessionId,
      teammateId,
      () => taskRuntime.currentTaskId,
      leadAgentId,
      teammate,
      { userId: '' } // session 在 processTeammateMessages 中不需要 userId
    ),
    contextMessages,
    maxIterations: 20,
    stopOnSuccessfulTools: ['report_task_completion'],
  })

  console.log(
    `[CognitiveTeammateRunner][${teammate.name}] Processed ${actionableMessages.length} messages: ${result.iterationsUsed} iterations`
  )

  // 注意：消息完成标记已由 handleProcessNow 在 attention-manager.ts 中处理

  // 检查是否任务完成
  if (result.toolCalls?.some(tc => tc.toolName === 'report_task_completion' && tc.status === 'completed')) {
    onTaskCompleted(true)
  }
}

/**
 * 构建Teammate系统提示
 */
function buildTeammateSystemPrompt(
  teammate: { name: string; role: string; description: string | null; capabilities: string | null },
  task: { title: string; description: string | null } | null
): string {
  const caps = teammate.capabilities
    ? (() => { try { return JSON.parse(teammate.capabilities) } catch { return [] } })()
    : []

  return TEAMMATE_SYSTEM_PROMPT_TEMPLATE
    .replace('{{name}}', teammate.name)
    .replace('{{role}}', teammate.role)
    .replace('{{description}}', teammate.description || '团队成员')
    .replace('{{capabilities}}', caps.length > 0 ? `- 能力: ${caps.join(', ')}` : '')
    .replace('{{currentTask}}', task
      ? `- 标题: ${task.title}\n- 描述: ${task.description || '无详细描述'}`
      : '- 当前没有活跃任务，请优先处理收件箱中的协调或澄清消息。')
}

/**
 * 构建Teammate工具执行器
 */
function buildTeammateToolExecutor(
  swarmSessionId: string,
  teammateId: string,
  getCurrentTaskId: () => string | null,
  leadAgentId: string,
  teammate: { name: string },
  session: { userId: string }
): ToolExecutor {
  const toolCache = new Map<string, string>()

  return async (name: string, input: Record<string, unknown>) => {
    const taskId = getCurrentTaskId()
    const task = taskId
      ? await prisma.teamLeadTask.findUnique({ where: { id: taskId } })
      : null

    const requiresActiveTask = new Set(['write_artifact', 'write_file', 'report_task_completion'])
    if (requiresActiveTask.has(name) && (!taskId || !task || task.status !== 'IN_PROGRESS')) {
      return JSON.stringify({ success: false, error: '当前没有可执行的活跃任务' })
    }

    switch (name) {
      case 'write_artifact':
        return handleWriteArtifact(swarmSessionId, teammateId, taskId, teammate, input)

      case 'write_file':
        return handleWriteFile(swarmSessionId, teammateId, taskId, session.userId, teammate, input)

      case 'read_file': {
        const fileId = input.file_id as string
        const cacheKey = `read_file:${fileId}`
        const cached = toolCache.get(cacheKey)
        if (cached) return cached

        const result = await handleReadFile(input)
        toolCache.set(cacheKey, result)
        return result
      }

      case 'report_task_completion': {
        if (!taskId || !task || task.status !== 'IN_PROGRESS') {
          return JSON.stringify({ success: false, error: '当前没有可完成的活跃任务' })
        }

        const report = input.report as string
        const resultSummary = input.result_summary as string | undefined

        // 更新任务状态
        await prisma.teamLeadTask.update({
          where: { id: taskId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            resultSummary: resultSummary || report.slice(0, 500),
          },
        })

        // 更新Agent状态
        await prisma.agent.update({
          where: { id: teammateId },
          data: { status: 'IDLE' },
        })

        const processor = getTeammateProcessor(swarmSessionId, teammateId)
        processor?.markTaskCompleted()

        publishStatusUpdate(swarmSessionId, { id: teammateId, name: teammate.name }, { id: taskId, title: task.title }, 'idle')

        // 通过内部消息通知Lead（而不是直接调用）
        const { sendInternalMessage, createInternalThread } = await import('./internal-bus')
        const thread = await createInternalThread({
          swarmSessionId,
          threadType: 'task_completion',
          subject: `任务完成: ${task.title}`,
          relatedTaskId: taskId,
        })

        await sendInternalMessage({
          swarmSessionId,
          threadId: thread.id,
          senderAgentId: teammateId,
          recipientAgentId: leadAgentId,
          messageType: 'task_complete',
          content: report,
          metadata: { taskId, resultSummary },
        })

        // 发布实时消息
        publishRealtimeMessage(
          {
            type: 'task_update',
            payload: {
              task_id: taskId,
              title: task.title,
              status: 'completed',
              assignee_id: teammateId,
              assignee_name: teammate.name,
              swarm_session_id: swarmSessionId,
              message: `${teammate.name} 完成了任务: ${task.title}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
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

        await sendInternalMessage({
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

      case 'save_progress':
        // 保存进度
        return JSON.stringify({
          success: true,
          saved_at: new Date().toISOString(),
          progress: input.progress,
        })

      case 'resume_work':
        // 恢复工作
        return JSON.stringify({
          success: true,
          resumed: true,
        })

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}

// 工具处理函数...
async function resolveFileOwnerContext(swarmSessionId: string): Promise<{ userId: string | null; sessionId: string }> {
  const swarmSession = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    select: { userId: true },
  })

  const userId = swarmSession?.userId || null
  if (!userId) {
    return { userId: null, sessionId: `swarm:${swarmSessionId}` }
  }

  const activeSession = await prisma.session.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  })

  return {
    userId,
    sessionId: activeSession?.id || `swarm:${swarmSessionId}`,
  }
}
async function handleWriteArtifact(
  swarmSessionId: string,
  teammateId: string,
  taskId: string | null,
  teammate: { name: string },
  input: Record<string, unknown>
): Promise<string> {
  const title = input.title as string
  const kind = (input.kind as string) || 'document'
  const content = input.content as string
  const summary = (input.summary as string) || null
  const { userId, sessionId } = await resolveFileOwnerContext(swarmSessionId)

  const artifact = await prisma.artifact.create({
    data: {
      swarmSessionId,
      ownerAgentId: teammateId,
      sourceTaskId: taskId,
      kind,
      title,
      summary,
      metadata: JSON.stringify({ content }),
    },
  })

  const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_')}.${getArtifactExtension(kind)}`
  const mimeType = getArtifactMimeType(kind)
  const uniqueName = `${randomUUID()}${path.extname(filename)}`
  const filePath = path.join(process.env.UPLOAD_DIR || './uploads', uniqueName)

  await mkdir(process.env.UPLOAD_DIR || './uploads', { recursive: true })
  await writeFileFs(filePath, content, 'utf-8')

  const fileRecord = await prisma.file.create({
    data: {
      filename: uniqueName,
      originalName: filename,
      mimeType,
      size: Buffer.byteLength(content, 'utf-8'),
      path: filePath,
      sessionId,
      swarmSessionId,
      userId,
    },
  })

  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { fileId: fileRecord.id },
  })

  publishRealtimeMessage(
    {
      type: 'internal_message',
      payload: {
        agent_id: teammateId,
        agent_name: teammate.name,
        action: 'artifact_created',
        artifact_id: artifact.id,
        artifact_title: title,
        file_id: fileRecord.id,
        file_name: filename,
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  return JSON.stringify({ success: true, artifact_id: artifact.id, file_id: fileRecord.id, title, kind })
}

async function handleWriteFile(
  swarmSessionId: string,
  teammateId: string,
  taskId: string | null,
  userId: string,
  teammate: { name: string },
  input: Record<string, unknown>
): Promise<string> {
  const filename = input.filename as string
  const content = input.content as string
  const { userId: resolvedUserId, sessionId } = await resolveFileOwnerContext(swarmSessionId)

  const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
  const ext = path.extname(filename) || ''
  const uniqueName = `${randomUUID()}${ext}`
  const filePath = path.join(UPLOAD_DIR, uniqueName)

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFileFs(filePath, content, 'utf-8')

  const fileRecord = await prisma.file.create({
    data: {
      filename: uniqueName,
      originalName: filename,
      mimeType: (input.mime_type as string) || 'text/plain',
      size: Buffer.byteLength(content, 'utf-8'),
      path: filePath,
      sessionId,
      swarmSessionId,
      userId: resolvedUserId || userId || null,
    },
  })

  await prisma.artifact.create({
    data: {
      swarmSessionId,
      ownerAgentId: teammateId,
      sourceTaskId: taskId,
      kind: 'generated_file',
      fileId: fileRecord.id,
      title: filename,
    },
  })

  publishRealtimeMessage(
    {
      type: 'internal_message',
      payload: {
        agent_id: teammateId,
        agent_name: teammate.name,
        action: 'file_created',
        file_id: fileRecord.id,
        file_name: filename,
        swarm_session_id: swarmSessionId,
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
  })
}

async function handleReadFile(input: Record<string, unknown>): Promise<string> {
  const fileId = input.file_id as string
  const file = await prisma.file.findUnique({ where: { id: fileId } })
  if (!file) {
    return JSON.stringify({ error: '文件不存在', file_id: fileId })
  }

  const extracted = await extractFileText({
    filePath: file.path,
    filename: file.originalName,
    mimeType: file.mimeType,
  })

  if (!extracted.success) {
    return JSON.stringify({
      success: false,
      filename: file.originalName,
      mime_type: file.mimeType,
      error: extracted.error || '无法读取文件内容',
      note: '请联系 Lead 提供可直接读取的纯文本、Markdown，或确认附件格式是否受支持；不要假装自己已经读过原文。',
    })
  }

  return JSON.stringify({
    success: true,
    filename: file.originalName,
    mime_type: file.mimeType,
    extraction_method: extracted.extractionMethod,
    content: (extracted.text || '').slice(0, 10000),
  })
}

async function buildTeammateContextMessages(
  swarmSessionId: string,
  teammateId: string,
  taskId: string | null,
  newMessagesSummary: string
): Promise<LLMMessage[]> {
  const messages: LLMMessage[] = []

  // 获取上下文条目
  const entries = await listAgentContextEntries(teammateId, 20)

  for (const entry of entries) {
    if (entry.entryType === 'task_assignment') {
      messages.push({ role: 'user', content: `[系统] ${entry.content}` })
    } else if (entry.entryType === 'assistant_response') {
      messages.push({ role: 'assistant', content: entry.content })
    }
  }

  // 获取可用文件与上游工件
  const artifacts = taskId
    ? await prisma.artifact.findMany({
        where: { sourceTaskId: taskId },
        include: { file: true },
      })
    : []

  const taskWithDeps = taskId
    ? await prisma.teamLeadTask.findUnique({
        where: { id: taskId },
        include: {
          dependencies: { include: { dependsOnTask: true } },
        },
      })
    : null

  const upstreamTaskIds = taskWithDeps?.dependencies.map(dep => dep.dependsOnTaskId) || []
  const upstreamArtifacts = upstreamTaskIds.length > 0
    ? await prisma.artifact.findMany({
        where: { sourceTaskId: { in: upstreamTaskIds } },
        include: { file: true, sourceTask: true },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const sessionFiles = await prisma.file.findMany({
    where: { swarmSessionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const fileSeen = new Set<string>()
  const allFiles: Array<{ id: string; originalName: string; description?: string }> = []

  for (const artifact of artifacts) {
    if (artifact.file && !fileSeen.has(artifact.file.id)) {
      fileSeen.add(artifact.file.id)
      allFiles.push({
        id: artifact.file.id,
        originalName: artifact.file.originalName,
        description: 'Task attachment',
      })
    }
  }

  for (const file of sessionFiles) {
    if (!fileSeen.has(file.id)) {
      fileSeen.add(file.id)
      allFiles.push({
        id: file.id,
        originalName: file.originalName,
      })
    }
  }

  if (allFiles.length > 0) {
    const fileInfo = allFiles
      .map(file => `- ${file.originalName} (文件ID: ${file.id})${file.description ? ` - ${file.description}` : ''}`)
      .join('\n')
    messages.push({
      role: 'user',
      content: `[可用文件列表]\n${fileInfo}\n\n如需读取文件内容，请使用 read_file 工具，传入上述文件ID。若 read_file 返回二进制文档错误，不得假装已阅读正文，必须向 Lead 请求可读文本。`,
    })
  }

  if (upstreamArtifacts.length > 0) {
    const upstreamSummaries = upstreamArtifacts
      .map(artifact => {
        let content = ''
        if (artifact.metadata) {
          try {
            const parsed = JSON.parse(artifact.metadata) as { content?: string }
            if (typeof parsed.content === 'string') {
              content = parsed.content
            }
          } catch {}
        }
        const snippet = content.trim().length > 0 ? content.slice(0, 2000) : (artifact.summary || '')
        return `- 来源任务: ${artifact.sourceTask?.title || '未知任务'} | 工件: ${artifact.title}\n${snippet}`
      })
      .join('\n\n')

    messages.push({
      role: 'user',
      content: `[上游任务产出]\n${upstreamSummaries}`,
    })
  }

  // 新消息
  messages.push({
    role: 'user',
    content: `## 新消息到达\n\n${newMessagesSummary}\n\n请处理这些消息。若附件正文不可读或缺失，请明确报告阻塞，不要基于常识伪造已阅读结果。`,
  })

  return messages
}

/**
 * 进度保存/恢复工具
 */
const progressTools: ToolDefinition[] = [
  {
    name: 'save_progress',
    description: '保存当前工作进度，以便稍后恢复',
    input_schema: {
      type: 'object',
      properties: {
        progress: { type: 'number', description: '当前进度 (0-100)' },
        notes: { type: 'string', description: '进度备注' },
      },
      required: ['progress'],
    },
  },
  {
    name: 'resume_work',
    description: '恢复之前保存的工作进度',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

/**
 * 发布状态更新
 */
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
function publishStatusUpdate(
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

/**
 * 等待任务完成
 */
async function waitForTaskCompletion(
  checkFn: () => boolean,
  intervalMs: number
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (checkFn()) {
        resolve()
      } else {
        setTimeout(check, intervalMs)
      }
    }
    check()
  })
}

/**
 * 获取Teammate处理器
 */
export function getTeammateProcessor(
  swarmSessionId: string,
  teammateId: string
) {
  const key = `${swarmSessionId}:${teammateId}`
  return teammateProcessors.get(key)
}
