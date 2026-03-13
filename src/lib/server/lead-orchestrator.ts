import prisma from '@/lib/db'
import { createTeammate, type CreateTeammateInput } from '@/lib/server/teammate-factory'
import { appendAgentContextEntry, listAgentContextEntries } from '@/lib/server/agent-context'
import { createInternalThread, sendInternalMessage } from '@/lib/server/internal-bus'
import { buildSessionTaskData } from '@/lib/server/swarm-session'
import { appendLeadReply, getSessionAttachments, attachFilesToTask } from '@/lib/server/external-chat'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { unlockDependentTasks } from '@/lib/server/task-orchestrator'

/**
 * Lead 编排器 - 由 LLM 驱动决策
 * 系统只提供工具，所有策略决策交给 Lead (LLM)
 */

export interface OrchestrateInput {
  swarmSessionId: string
  userId: string
  leadAgentId: string
  userMessage: string
  attachments?: Array<{
    fileId: string
    fileName: string
    mimeType: string
  }>
}

/**
 * 获取 Lead 的完整上下文（包括历史消息、任务状态、teammates 状态、附件）
 */
export async function getLeadContext(swarmSessionId: string, leadAgentId: string) {
  const [contextEntries, tasks, teammates, session, attachments] = await Promise.all([
    listAgentContextEntries(leadAgentId, 50),
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId },
      include: { assignee: true, subtasks: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.findMany({
      where: { swarmSessionId, status: { not: 'OFFLINE' } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.swarmSession.findUnique({
      where: { id: swarmSessionId },
    }),
    getSessionAttachments(swarmSessionId),
  ])

  return {
    contextEntries,
    tasks,
    teammates,
    session,
    attachments,
  }
}

/**
 * Lead 创建 teammate 的工具函数
 */
export async function provisionTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  definition: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>
) {
  return createTeammate({
    ...definition,
    swarmSessionId,
    createdById: leadAgentId,
  })
}

/**
 * Lead 拆解任务的工具函数
 * 支持附件传递
 */
export async function decomposeTask(
  swarmSessionId: string,
  leadAgentId: string,
  tasks: Array<{
    title: string
    description?: string
    priority?: number
    parentId?: string
    attachments?: string[] // fileIds to attach to this task
  }>
) {
  const createdTasks = await Promise.all(
    tasks.map(task =>
      prisma.teamLeadTask.create({
        data: buildSessionTaskData({
          swarmSessionId,
          creatorId: leadAgentId,
          title: task.title,
          description: task.description || null,
          priority: task.priority || 2,
          parentId: task.parentId || null,
        }),
        include: { assignee: true, parent: true, subtasks: true },
      })
    )
  )

  // 处理附件关联
  for (let i = 0; i < createdTasks.length; i++) {
    const task = createdTasks[i]
    const taskInput = tasks[i]

    if (taskInput.attachments && taskInput.attachments.length > 0) {
      await attachFilesToTask(swarmSessionId, task.id, taskInput.attachments)
    }

    // 广播任务创建
    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: {
          task_id: task.id,
          title: task.title,
          status: 'pending',
          swarm_session_id: swarmSessionId,
          message: `任务创建: ${task.title}`,
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )
  }

  return createdTasks
}

/**
 * Lead 分配任务的工具函数
 */
export async function assignTaskToTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  taskId: string,
  teammateId: string
) {
  const [task, teammate] = await Promise.all([
    prisma.teamLeadTask.findUnique({ where: { id: taskId } }),
    prisma.agent.findUnique({ where: { id: teammateId } }),
  ])

  if (!task || !teammate) {
    throw new Error('TASK_OR_AGENT_NOT_FOUND')
  }

  const updatedTask = await prisma.teamLeadTask.update({
    where: { id: taskId },
    data: {
      assigneeId: teammateId,
      status: 'ASSIGNED',
    },
    include: { assignee: true },
  })

  // 向 teammate 添加上下文
  await appendAgentContextEntry({
    swarmSessionId,
    agentId: teammateId,
    sourceType: 'task',
    sourceId: taskId,
    entryType: 'task_assignment',
    content: `你被分配任务: ${task.title}\n\n${task.description || ''}`,
    metadata: { assignedBy: leadAgentId },
  })

  // Lead 向 teammate 发送任务简报
  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId, relatedTaskId: taskId },
  }) || await createInternalThread({
    swarmSessionId,
    threadType: 'task_coordination',
    subject: `任务: ${task.title}`,
    relatedTaskId: taskId,
  })

  await sendInternalMessage({
    swarmSessionId,
    threadId: thread.id,
    senderAgentId: leadAgentId,
    recipientAgentId: teammateId,
    messageType: 'task_assignment',
    content: `任务分配: ${task.title}\n\n${task.description || ''}\n\n请开始执行，完成后向我汇报。`,
  })

  // 广播
  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: taskId,
        title: task.title,
        status: 'assigned',
        assignee_id: teammateId,
        assignee_name: teammate.name,
        swarm_session_id: swarmSessionId,
        message: `任务 "${task.title}" 已分配给 ${teammate.name}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  return updatedTask
}

/**
 * Lead 向用户回复的工具函数
 */
export async function replyToUser(
  swarmSessionId: string,
  userId: string,
  leadAgentId: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  const reply = await appendLeadReply({
    swarmSessionId,
    userId,
    leadAgentId,
    content,
    metadata,
  })

  // 广播到 WebSocket
  publishRealtimeMessage(
    {
      type: 'chat_message',
      payload: {
        id: reply.id,
        swarm_session_id: swarmSessionId,
        sender_type: 'lead',
        sender_id: leadAgentId,
        sender_name: 'Lead',
        content,
        message_type: 'text',
        created_at: reply.createdAt.toISOString(),
        timestamp: reply.createdAt.toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  return reply
}

/**
 * Lead 向 teammate 发送内部消息的工具函数
 */
export async function sendToTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  teammateId: string,
  content: string,
  messageType: string = 'coordination'
) {
  // 查找或创建线程
  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId, threadType: 'lead_teammate' },
  }) || await createInternalThread({
    swarmSessionId,
    threadType: 'lead_teammate',
    subject: 'Lead-Teammate 协调',
  })

  return sendInternalMessage({
    swarmSessionId,
    threadId: thread.id,
    senderAgentId: leadAgentId,
    recipientAgentId: teammateId,
    messageType,
    content,
  })
}

/**
 * 核心编排入口 - 由外部调用触发
 * 收集上下文，交给 LLM 决策，执行决策结果
 */
export async function orchestrate(input: OrchestrateInput) {
  // 1. 获取完整上下文
  const context = await getLeadContext(input.swarmSessionId, input.leadAgentId)

  // 2. 记录用户消息到 Lead 上下文
  await appendAgentContextEntry({
    swarmSessionId: input.swarmSessionId,
    agentId: input.leadAgentId,
    sourceType: 'external_message',
    entryType: 'user_input',
    content: input.userMessage,
    metadata: {
      userId: input.userId,
      hasAttachments: input.attachments && input.attachments.length > 0,
      attachments: input.attachments,
    },
  })

  // 3. 返回上下文供上层调用 LLM
  return {
    context,
    userMessage: input.userMessage,
    attachments: input.attachments,
    // 提供工具函数给 LLM 决策后调用
    tools: {
      provisionTeammate: (def: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>) =>
        provisionTeammate(input.swarmSessionId, input.leadAgentId, def),
      decomposeTask: (tasks: Parameters<typeof decomposeTask>[2]) =>
        decomposeTask(input.swarmSessionId, input.leadAgentId, tasks),
      assignTaskToTeammate: (taskId: string, teammateId: string) =>
        assignTaskToTeammate(input.swarmSessionId, input.leadAgentId, taskId, teammateId),
      replyToUser: (content: string, metadata?: Record<string, unknown>) =>
        replyToUser(input.swarmSessionId, input.userId, input.leadAgentId, content, metadata),
      sendToTeammate: (teammateId: string, content: string, messageType?: string) =>
        sendToTeammate(input.swarmSessionId, input.leadAgentId, teammateId, content, messageType),
    },
  }
}

/**
 * Teammate 完成任务后汇报的处理入口
 */
export async function handleTeammateReport(
  swarmSessionId: string,
  leadAgentId: string,
  teammateId: string,
  taskId: string,
  report: string,
  resultSummary?: string
) {
  // 更新任务状态
  const task = await prisma.teamLeadTask.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      resultSummary: resultSummary || report.slice(0, 500),
    },
    include: { assignee: true },
  })

  // 记录到 Lead 上下文
  await appendAgentContextEntry({
    swarmSessionId,
    agentId: leadAgentId,
    sourceType: 'task',
    sourceId: taskId,
    entryType: 'task_completion',
    content: `任务完成汇报: ${task.title}\n\n${report}`,
    metadata: {
      completedBy: teammateId,
      taskId,
    },
  })

  // 更新 teammate 状态
  await prisma.agent.update({
    where: { id: teammateId },
    data: { status: 'IDLE' },
  })

  // 广播
  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: taskId,
        title: task.title,
        status: 'completed',
        swarm_session_id: swarmSessionId,
        message: `任务 "${task.title}" 已完成`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // 检查是否有解锁的子任务（parent-child关系）
  const unlockedSubtasks = await prisma.teamLeadTask.findMany({
    where: { parentId: taskId, status: 'PENDING' },
  })

  for (const subtask of unlockedSubtasks) {
    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: {
          task_id: subtask.id,
          title: subtask.title,
          status: 'pending',
          swarm_session_id: swarmSessionId,
          message: `任务 "${subtask.title}" 已解锁（父任务完成）`,
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )
  }

  // 检查依赖图解锁（TaskDependency关系）
  const unlockedDeps = await unlockDependentTasks(taskId)

  return { task, unlockedTasks: [...unlockedSubtasks, ...unlockedDeps] }
}
