import prisma from '@/lib/db'
import { createTeammate, type CreateTeammateInput } from '@/lib/server/teammate-factory'
import { appendAgentContextEntry, listAgentContextEntries } from '@/lib/server/agent-context'
import { createInternalThread, sendInternalMessage, initializeTeamAwareness, resolveAgentInSession } from '@/lib/server/internal-bus'
import { buildSessionTaskData } from '@/lib/server/swarm-session'
import { appendLeadReply, getSessionAttachments, attachFilesToTask } from '@/lib/server/external-chat'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { unlockDependentTasks } from '@/lib/server/task-orchestrator'
import { triggerTaskExecution } from '@/lib/server/parallel-scheduler'

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

type SendToTeammateResult = {
  id: string
  skipped?: boolean
  reason?: string
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeCapabilities(value: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : []

  return Array.from(new Set(raw.map(item => normalizeComparableText(item)).filter(Boolean))).sort()
}

function isSameTeammateDefinition(
  existing: { name: string; role: string; description: string | null; capabilities: string | null },
  requested: { name: string; role: string; description: string; capabilities: string[] }
): boolean {
  const sameRole = normalizeComparableText(existing.role) === normalizeComparableText(requested.role)
  if (!sameRole) return false

  const sameName = normalizeComparableText(existing.name) === normalizeComparableText(requested.name)
  if (sameName) return true

  const sameDescription = normalizeComparableText(existing.description) === normalizeComparableText(requested.description)
  const existingCapabilities = normalizeCapabilities(existing.capabilities)
  const requestedCapabilities = normalizeCapabilities(requested.capabilities)
  const sameCapabilities = existingCapabilities.length === requestedCapabilities.length
    && existingCapabilities.every((capability, index) => capability === requestedCapabilities[index])

  return sameDescription && sameCapabilities
}

function normalizeTaskTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isLeadMetaTask(task: { title: string; description?: string }): boolean {
  const text = `${task.title} ${(task.description || '')}`.trim()

  return /(跟进|跟踪|追踪|监控|等待|催办|督办|同步)/.test(text)
    || (/汇报|报告/.test(text) && /(进度|结果|完成情况|状态)/.test(text))
    || (/向用户/.test(text) && /(汇报|回复|告知)/.test(text))
}

function inferParentTaskTitle(task: { title: string; parentTitle?: string; description?: string }): string | null {
  if (task.parentTitle?.trim()) return task.parentTitle.trim()

  const title = task.title.trim()
  const description = (task.description || '').trim()

  if (/撰写|报告|整合/.test(title) && /分析|阅读/.test(description)) {
    return '多角度文学分析'
  }

  if (/分析/.test(title) && /阅读|理解/.test(description)) {
    return '阅读理解Emma小说'
  }

  return null
}

function isCeremonialCompletionMessage(content: string): boolean {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return /感谢|谢谢|辛苦了|请确认|确认当前工作状态|确认状态|保持待命|任务顺利结束|所有任务已完成|当前无进行中的工作|all tasks (are )?complete|confirm (your )?(current )?status|thanks|thank you/i.test(normalized)
}

async function resolveDependencyTaskIds(
  swarmSessionId: string,
  taskRefs: string[]
): Promise<string[]> {
  const resolvedIds: string[] = []

  for (const taskRef of taskRefs) {
    const resolvedTask = await resolveTaskInSession(swarmSessionId, taskRef)
    if (resolvedTask) {
      resolvedIds.push(resolvedTask.id)
    } else {
      console.warn('[decomposeTask] Ignoring unresolved dependency reference: ' + taskRef)
    }
  }

  return resolvedIds
}
async function resolveTaskInSession(swarmSessionId: string, taskRef: string) {
  const trimmedRef = taskRef.trim()
  if (!trimmedRef) return null

  const exactId = await prisma.teamLeadTask.findFirst({
    where: { id: trimmedRef, swarmSessionId },
    include: { assignee: true, parent: true, subtasks: true },
  })
  if (exactId) return exactId

  const candidates = await prisma.teamLeadTask.findMany({
    where: {
      swarmSessionId,
      status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
    },
    include: { assignee: true, parent: true, subtasks: true },
    orderBy: { createdAt: 'desc' },
  })

  const normalizedRef = normalizeTaskTitle(trimmedRef)
  const exactTitle = candidates.find(task => normalizeTaskTitle(task.title) === normalizedRef)
  if (exactTitle) return exactTitle

  const fuzzyMatches = candidates.filter(task => {
    const normalizedTitle = normalizeTaskTitle(task.title)
    return normalizedTitle.includes(normalizedRef) || normalizedRef.includes(normalizedTitle)
  })

  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0]
  }

  return null
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
 * 创建后初始化团队感知，让新队友了解现有团队成员
 */
export async function provisionTeammate(
  swarmSessionId: string,
  leadAgentId: string,
  definition: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>
) {
  const existingCandidates = await prisma.agent.findMany({
    where: {
      swarmSessionId,
      id: { not: leadAgentId },
      status: { not: 'OFFLINE' },
    },
    select: { id: true, name: true, role: true, status: true, description: true, capabilities: true },
  })
  const existingMatch = existingCandidates.find(agent => isSameTeammateDefinition(agent, {
    name: definition.name,
    role: definition.role,
    description: definition.description,
    capabilities: definition.capabilities,
  }))

  if (existingMatch) {
    throw new Error(`TEAMMATE_DEFINITION_EXISTS:${existingMatch.id}:${existingMatch.name}:${existingMatch.role}:${existingMatch.status}`)
  }

  // 创建队友
  const result = await createTeammate({
    ...definition,
    swarmSessionId,
    createdById: leadAgentId,
  })

  // 初始化团队感知 - 让新队友了解现有团队成员
  const awareness = await initializeTeamAwareness({
    swarmSessionId,
    newAgentId: result.agent.id,
    leadAgentId,
  })

  console.log(
    `[LeadOrchestrator] Created teammate ${result.agent.name}, initialized team awareness: ${awareness.hasExistingTeammates ? awareness.teammateCount : 0} existing teammates`
  )

  return {
    ...result,
    teamAwareness: awareness,
  }
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
    parentTitle?: string
    attachments?: string[] // fileIds to attach to this task
  }>
) {
  console.log(`[decomposeTask] Creating ${tasks.length} tasks with creatorId: ${leadAgentId}`)

  const filteredTasks = tasks.filter(task => !isLeadMetaTask(task))
  if (filteredTasks.length !== tasks.length) {
    console.warn(`[decomposeTask] Filtered out ${tasks.length - filteredTasks.length} lead meta task(s) that should remain lead responsibilities`)
  }

  if (filteredTasks.length === 0) {
    return []
  }

  // 验证 creatorId 对应的 Agent 存在
  const creatorAgent = await prisma.agent.findUnique({ where: { id: leadAgentId } })
  if (!creatorAgent) {
    throw new Error(`Creator agent not found: ${leadAgentId}. Cannot create tasks.`)
  }
  console.log(`[decomposeTask] Verified creator agent exists: ${creatorAgent.name}`)

  const existingActiveTasks = await prisma.teamLeadTask.findMany({
    where: {
      swarmSessionId,
      status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
    },
    include: { assignee: true, parent: true, subtasks: true },
    orderBy: { createdAt: 'asc' },
  })

  const existingByNormalizedTitle = new Map(
    existingActiveTasks.map(task => [normalizeTaskTitle(task.title), task])
  )

  // 第一阶段：先创建所有任务，不绑定 parent，避免 LLM 提供的临时 parentId 直接触发外键错误。
  const createdTasks: Awaited<ReturnType<typeof prisma.teamLeadTask.create>>[] = []
  const batchResolvedByTitle = new Map<string, Awaited<ReturnType<typeof prisma.teamLeadTask.create>>>()
  for (const task of filteredTasks) {
    const normalizedTitle = normalizeTaskTitle(task.title)
    const reusedTask = batchResolvedByTitle.get(normalizedTitle) || existingByNormalizedTitle.get(normalizedTitle)

    if (reusedTask) {
      console.log(`[decomposeTask] Reusing existing task for title: ${task.title} (${reusedTask.id})`)
      createdTasks.push(reusedTask)
      batchResolvedByTitle.set(normalizedTitle, reusedTask)
      continue
    }

    try {
      const created = await prisma.teamLeadTask.create({
        data: buildSessionTaskData({
          swarmSessionId,
          creatorId: leadAgentId,
          title: task.title,
          description: task.description || null,
          priority: task.priority || 2,
          parentId: null,
        }),
        include: { assignee: true, parent: true, subtasks: true },
      })
      createdTasks.push(created)
      batchResolvedByTitle.set(normalizedTitle, created)
    } catch (error) {
      console.error(`[decomposeTask] Failed to create task "${task.title}":`, error)
      throw error
    }
  }

  const createdByTitle = new Map(createdTasks.map(task => [task.title, task.id]))

  // 第二阶段：安全绑定 parent。只接受已存在数据库 task id，或同批已创建任务的标题引用。
  for (let i = 0; i < createdTasks.length; i++) {
    const taskInput = filteredTasks[i]
    const createdTask = createdTasks[i]

    const requestedParentId = taskInput.parentId?.trim()
    const requestedParentTitle = taskInput.parentTitle?.trim() || requestedParentId

    let resolvedParentId: string | null = null

    if (requestedParentId) {
      const existingParent = await prisma.teamLeadTask.findFirst({
        where: {
          id: requestedParentId,
          swarmSessionId,
        },
        select: { id: true },
      })

      if (existingParent) {
        resolvedParentId = existingParent.id
      }
    }

    if (!resolvedParentId && requestedParentTitle) {
      resolvedParentId = createdByTitle.get(requestedParentTitle) || null
    }

    if (resolvedParentId && resolvedParentId !== createdTask.id) {
      createdTasks[i] = await prisma.teamLeadTask.update({
        where: { id: createdTask.id },
        data: { parentId: resolvedParentId },
        include: { assignee: true, parent: true, subtasks: true },
      })
    } else if (requestedParentId || taskInput.parentTitle) {
      console.warn(
        `[decomposeTask] Ignoring unresolved parent reference for "${createdTask.title}": parentId=${requestedParentId || 'n/a'}, parentTitle=${taskInput.parentTitle || 'n/a'}`
      )
    }
  }

  // 第三阶段：根据显式依赖和 parent 关系补建任务依赖，这样 scheduler 会真正等待上游完成。
  for (let i = 0; i < createdTasks.length; i++) {
    const taskInput = filteredTasks[i] as typeof filteredTasks[number] & { dependsOnTaskIds?: string[]; dependsOnTaskTitles?: string[] }
    const createdTask = createdTasks[i]
    const inferredParentTitle = inferParentTaskTitle(taskInput)
    const parentTitle = taskInput.parentTitle?.trim() || inferredParentTitle
    const parentId = createdTask.parentId || (parentTitle ? createdByTitle.get(parentTitle) || null : null)

    const resolvedExplicitDependencyIds = await resolveDependencyTaskIds(
      swarmSessionId,
      taskInput.dependsOnTaskIds || []
    )

    const explicitDependencyIds = [
      ...resolvedExplicitDependencyIds,
      ...((taskInput.dependsOnTaskTitles || []).map(title => createdByTitle.get(title) || null).filter(Boolean) as string[]),
      ...(parentId ? [parentId] : []),
    ].filter((value, index, array) => !!value && array.indexOf(value) === index)

    for (const dependencyId of explicitDependencyIds) {
      if (!dependencyId || dependencyId === createdTask.id) continue

      await prisma.taskDependency.upsert({
        where: {
          taskId_dependsOnTaskId: {
            taskId: createdTask.id,
            dependsOnTaskId: dependencyId,
          },
        },
        update: {},
        create: {
          swarmSessionId,
          taskId: createdTask.id,
          dependsOnTaskId: dependencyId,
          dependencyType: 'blocks',
        },
      })
    }
  }

  const sessionAttachments = await getSessionAttachments(swarmSessionId)

  // 处理附件关联
  for (let i = 0; i < createdTasks.length; i++) {
    const task = createdTasks[i]
    const taskInput = filteredTasks[i]

    const effectiveAttachments = taskInput.attachments && taskInput.attachments.length > 0
      ? taskInput.attachments
      : i === 0
        ? sessionAttachments.map(file => file.fileId)
        : []

    if (effectiveAttachments.length > 0) {
      await attachFilesToTask(swarmSessionId, task.id, effectiveAttachments)
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

  return Array.from(new Map(createdTasks.map(task => [task.id, task])).values())
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
    resolveTaskInSession(swarmSessionId, taskId),
    resolveAgentInSession(swarmSessionId, teammateId, { excludeAgentIds: [leadAgentId] }),
  ])

  if (!task || !teammate) {
    throw new Error(`TASK_OR_AGENT_NOT_FOUND:${taskId}:${teammateId}`)
  }

  if (task.assigneeId === teammate.id && (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS')) {
    return task
  }

  const teammateActiveTask = await prisma.teamLeadTask.findFirst({
    where: {
      swarmSessionId,
      assigneeId: teammate.id,
      status: 'IN_PROGRESS',
      id: { not: task.id },
    },
    select: { id: true, title: true },
  })

  const isQueuedBehindActiveTask = !!teammateActiveTask

  const updatedTask = await prisma.teamLeadTask.update({
    where: { id: task.id },
    data: {
      assigneeId: teammate.id,
      status: 'ASSIGNED',
    },
    include: { assignee: true },
  })

  // 向 teammate 添加上下文
  await appendAgentContextEntry({
    swarmSessionId,
    agentId: teammate.id,
    sourceType: 'task',
    sourceId: task.id,
    entryType: 'task_assignment',
    content: `你被分配任务: ${task.title}\n\n${task.description || ''}`,
    metadata: { assignedBy: leadAgentId },
  })

  // Lead 向 teammate 发送任务简报
  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId, relatedTaskId: task.id },
  }) || await createInternalThread({
    swarmSessionId,
    threadType: 'task_coordination',
    subject: `任务: ${task.title}`,
    relatedTaskId: task.id,
  })

  // 检查任务依赖
  const taskWithDeps = await prisma.teamLeadTask.findUnique({
    where: { id: task.id },
    include: {
      dependencies: {
        include: { dependsOnTask: true },
      },
    },
  })

  const pendingDeps = taskWithDeps?.dependencies.filter(
    d => d.dependsOnTask.status !== 'COMPLETED'
  ) || []

  const assignmentMessage = pendingDeps.length > 0
    ? `任务 "${task.title}" 已分配给你。注意：此任务有 ${pendingDeps.length} 个前置依赖尚未完成，将在依赖完成后自动启动。`
    : isQueuedBehindActiveTask
      ? `任务 "${task.title}" 已分配给你。你当前正在处理 "${teammateActiveTask!.title}"，该新任务已进入等待队列，会在你空闲后自动启动。`
      : `任务 "${task.title}" 已分配给你，即将开始执行。`

  await sendInternalMessage({
    swarmSessionId,
    threadId: thread.id,
    senderAgentId: leadAgentId,
    recipientAgentId: teammate.id,
    messageType: 'task_assignment',
    content: assignmentMessage,
    metadata: {
      taskId: task.id,
      hasPendingDependencies: pendingDeps.length > 0,
      pendingDependencyCount: pendingDeps.length,
      queuedBehindTaskId: teammateActiveTask?.id,
      queuedBehindTaskTitle: teammateActiveTask?.title,
    },
  })

  // 广播任务分配
  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: task.id,
        title: task.title,
        status: 'assigned',
        assignee_id: teammate.id,
        assignee_name: teammate.name,
        swarm_session_id: swarmSessionId,
        has_dependencies: pendingDeps.length > 0,
        queued_behind_task_id: teammateActiveTask?.id,
        message: `任务 "${task.title}" 分配给 ${teammate.name}${pendingDeps.length > 0 ? ' (等待依赖)' : isQueuedBehindActiveTask ? ' (排队中)' : ''}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // 如果没有待处理的依赖且 assignee 当前空闲，则立即触发执行；否则保留 ASSIGNED 等待调度器自动启动。
  if (pendingDeps.length === 0 && !isQueuedBehindActiveTask) {
    try {
      await triggerTaskExecution(swarmSessionId, task.id)
    } catch (error) {
      console.error(`[LeadOrchestrator] Failed to trigger task execution:`, error)
    }
  }

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
): Promise<SendToTeammateResult> {
  // 验证发送者和接收者都存在
  const [leadAgent, teammate, tasks] = await Promise.all([
    prisma.agent.findUnique({ where: { id: leadAgentId } }),
    resolveAgentInSession(swarmSessionId, teammateId, { excludeAgentIds: [leadAgentId] }),
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId },
      select: { status: true },
    }),
  ])

  if (!leadAgent) {
    throw new Error(`Lead agent not found: ${leadAgentId}`)
  }
  if (!teammate) {
    throw new Error(`Teammate not found: ${teammateId}`)
  }

  const hasActiveTasks = tasks.some(task => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status))
  if (!hasActiveTasks && messageType === 'coordination' && isCeremonialCompletionMessage(content)) {
    console.log('[LeadOrchestrator] Skipping ceremonial teammate message after session completion')
    return {
      id: 'noop',
      skipped: true,
      reason: 'all_tasks_completed',
    }
  }

  // 查找或创建线程
  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId, threadType: 'lead_teammate' },
  }) || await createInternalThread({
    swarmSessionId,
    threadType: 'lead_teammate',
    subject: 'Lead-Teammate 协调',
  })

  const message = await sendInternalMessage({
    swarmSessionId,
    threadId: thread.id,
    senderAgentId: leadAgentId,
    recipientAgentId: teammate.id,
    messageType,
    content,
  })

  return {
    id: message.id,
  }
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
