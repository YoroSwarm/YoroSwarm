import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { createInternalThread, resolveAgentInSession } from '@/lib/server/internal-bus'
import { buildSessionTaskData } from '@/lib/server/swarm-session'
import { getSessionAttachments, attachFilesToTask } from '@/lib/server/external-chat'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { activateAssignedTask } from './task-activation'
import { unlockDependentTasks } from '@/lib/server/task-orchestrator'

// Private helpers

function normalizeTaskTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isFollowUpTaskRequest(task: {
  title: string
  description?: string
  parentId?: string
  parentTitle?: string
  dependsOnTaskIds?: string[]
  dependsOnTaskTitles?: string[]
}): boolean {
  return Boolean(
    task.parentId?.trim()
    || task.parentTitle?.trim()
    || task.dependsOnTaskIds?.length
    || task.dependsOnTaskTitles?.length
  )
}

function shouldReuseExistingTask(
  existingTask: { status: string },
  task: {
    title: string
    description?: string
    parentId?: string
    parentTitle?: string
    dependsOnTaskIds?: string[]
    dependsOnTaskTitles?: string[]
  }
): boolean {
  if (existingTask.status !== 'COMPLETED') {
    return true
  }

  return !isFollowUpTaskRequest(task)
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

// Exported functions

/**
 * Lead 拆解任务的工具函数
 * 支持附件传递
 */
export async function decomposeTask(
  swarmSessionId: string,
  leadAgentId: string,
  tasks: Array<{
    id?: string
    title: string
    description?: string
    priority?: number
    parentId?: string
    parentTitle?: string
    attachments?: string[]
    dependsOnTaskIds?: string[]
    dependsOnTaskTitles?: string[]
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

  const existingSessionTasks = await prisma.teamLeadTask.findMany({
    where: {
      swarmSessionId,
      status: { notIn: ['FAILED', 'CANCELLED'] },
    },
    include: { assignee: true, parent: true, subtasks: true },
    orderBy: { createdAt: 'asc' },
  })

  const existingByNormalizedTitle = new Map<string, typeof existingSessionTasks[number]>()
  for (const task of existingSessionTasks) {
    const normalizedTitle = normalizeTaskTitle(task.title)
    const current = existingByNormalizedTitle.get(normalizedTitle)
    if (!current) {
      existingByNormalizedTitle.set(normalizedTitle, task)
      continue
    }

    const currentIsCompleted = current.status === 'COMPLETED'
    const nextIsCompleted = task.status === 'COMPLETED'
    if (currentIsCompleted && !nextIsCompleted) {
      existingByNormalizedTitle.set(normalizedTitle, task)
    }
  }

  // 第一阶段：先创建所有任务，不绑定 parent，避免 LLM 提供的临时 parentId 直接触发外键错误。
  const createdTasks: Array<Awaited<ReturnType<typeof prisma.teamLeadTask.create>> & { reuseSource?: 'created' | 'reused' }> = []
  const batchResolvedByTitle = new Map<string, Awaited<ReturnType<typeof prisma.teamLeadTask.create>>>()
  const usedCustomIds = new Set<string>()

  for (const task of filteredTasks) {
    const normalizedTitle = normalizeTaskTitle(task.title)
    const batchResolvedTask = batchResolvedByTitle.get(normalizedTitle)
    const existingTask = existingByNormalizedTitle.get(normalizedTitle)
    const reusedTask = batchResolvedTask || (existingTask && shouldReuseExistingTask(existingTask, task) ? existingTask : null)

    if (reusedTask) {
      console.log(`[decomposeTask] Reusing existing task for title: ${task.title} (${reusedTask.id})`)
      createdTasks.push({ ...reusedTask, reuseSource: 'reused' })
      batchResolvedByTitle.set(normalizedTitle, reusedTask)
      continue
    }

    // 检查自定义 ID 是否已被使用
    if (task.id) {
      if (usedCustomIds.has(task.id)) {
        throw new Error(`TASK_ID_CONFLICT: ID "${task.id}" 在同一批次任务中重复使用，请使用不同的 ID。`)
      }
      const existingWithId = existingSessionTasks.find(t => t.id === task.id)
      if (existingWithId) {
        throw new Error(`TASK_ID_CONFLICT: ID "${task.id}" 已被其他任务使用，请使用其他 ID。`)
      }
      usedCustomIds.add(task.id)
    }

    try {
      const created = await prisma.teamLeadTask.create({
        data: {
          id: task.id || undefined,  // 使用自定义 ID 或让 Prisma 生成
          ...buildSessionTaskData({
            swarmSessionId,
            creatorId: leadAgentId,
            title: task.title,
            description: task.description || null,
            priority: task.priority || 2,
            parentId: null,
          }),
        },
        include: { assignee: true, parent: true, subtasks: true },
      })
      createdTasks.push({ ...created, reuseSource: 'created' })
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
    return {
      ...task,
      assignmentChanged: false,
      reusedAssignment: true,
    }
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

  if (pendingDeps.length === 0) {
    await activateAssignedTask({
      swarmSessionId,
      leadAgentId,
      taskId: task.id,
      teammateId: teammate.id,
      reason: 'assignment',
      queuedBehindTaskId: teammateActiveTask?.id,
      queuedBehindTaskTitle: teammateActiveTask?.title,
    })
  } else {
    // 前置依赖未完成，仅预创建协调线程，不向 teammate 投递任何消息。
    // 等到所有依赖完成后，由 unlockDependentTasks → activateAssignedTask 投递。
    await prisma.internalThread.findFirst({
      where: { swarmSessionId, relatedTaskId: task.id },
    }) || await createInternalThread({
      swarmSessionId,
      threadType: 'task_coordination',
      subject: `任务: ${task.title}`,
      relatedTaskId: task.id,
    })
  }

  return {
    ...updatedTask,
    assignmentChanged: true,
    reusedAssignment: false,
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
