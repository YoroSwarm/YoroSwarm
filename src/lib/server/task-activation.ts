import prisma from '@/lib/db'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { createInternalThread, sendInternalMessage } from '@/lib/server/internal-bus'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { triggerTaskExecution } from './parallel-scheduler'

type ActivationReason = 'assignment' | 'dependencies_unlocked'

function buildLeadToTeammateRuntimeControl(taskId: string) {
  return {
    plane: 'work' as const,
    interruption: 'soft' as const,
    workUnitKey: `task:${taskId}`,
    supersedesPending: true,
  }
}

export async function activateAssignedTask(input: {
  swarmSessionId: string
  leadAgentId: string
  taskId: string
  teammateId: string
  reason: ActivationReason
  queuedBehindTaskId?: string | null
  queuedBehindTaskTitle?: string | null
}) {
  const task = await prisma.teamLeadTask.findUnique({
    where: { id: input.taskId },
    include: {
      assignee: true,
      dependencies: { include: { dependsOnTask: true } },
    },
  })

  if (!task || task.assigneeId !== input.teammateId) {
    throw new Error(`TASK_ASSIGNEE_MISMATCH:${input.taskId}:${input.teammateId}`)
  }

  const pendingDeps = task.dependencies.filter((dependency) => dependency.dependsOnTask.status !== 'COMPLETED')
  if (pendingDeps.length > 0) {
    return { delivered: false, started: false, blockedByDependencies: true }
  }

  const teammate = task.assignee
  if (!teammate) {
    throw new Error(`TASK_ASSIGNEE_NOT_FOUND:${input.taskId}:${input.teammateId}`)
  }

  await appendAgentContextEntry({
    swarmSessionId: input.swarmSessionId,
    agentId: teammate.id,
    sourceType: 'task',
    sourceId: task.id,
    entryType: 'task_assignment',
    content: `你被分配任务: ${task.title}\n\n${task.description || ''}`,
    metadata: {
      assignedBy: input.leadAgentId,
      activationReason: input.reason,
    },
  })

  const thread = await prisma.internalThread.findFirst({
    where: { swarmSessionId: input.swarmSessionId, relatedTaskId: task.id },
  }) || await createInternalThread({
    swarmSessionId: input.swarmSessionId,
    threadType: 'task_coordination',
    subject: `任务: ${task.title}`,
    relatedTaskId: task.id,
  })

  const assignmentMessage = input.reason === 'dependencies_unlocked'
    ? `任务 "${task.title}" 的前置任务已完成，现已自动进入你的收件箱并开始执行。`
    : input.queuedBehindTaskId
      ? `任务 "${task.title}" 已分配给你。你当前正在处理 "${input.queuedBehindTaskTitle || '其他任务'}"，该新任务已进入等待队列，会在你空闲后自动启动。`
      : `任务 "${task.title}" 已分配给你，即将开始执行。`

  await sendInternalMessage({
    swarmSessionId: input.swarmSessionId,
    threadId: thread.id,
    senderAgentId: input.leadAgentId,
    recipientAgentId: teammate.id,
    messageType: 'task_assignment',
    content: assignmentMessage,
    metadata: {
      taskId: task.id,
      activationReason: input.reason,
      queuedBehindTaskId: input.queuedBehindTaskId || undefined,
      queuedBehindTaskTitle: input.queuedBehindTaskTitle || undefined,
      runtimeControl: buildLeadToTeammateRuntimeControl(task.id),
    },
  })

  publishRealtimeMessage(
    {
      type: 'task_update',
      payload: {
        task_id: task.id,
        title: task.title,
        status: 'assigned',
        assignee_id: teammate.id,
        assignee_name: teammate.name,
        swarm_session_id: input.swarmSessionId,
        queued_behind_task_id: input.queuedBehindTaskId || undefined,
        message: input.reason === 'dependencies_unlocked'
          ? `任务 "${task.title}" 的前置任务已完成，已自动投递给 ${teammate.name}`
          : `任务 "${task.title}" 分配给 ${teammate.name}${input.queuedBehindTaskId ? ' (排队中)' : ''}`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: input.swarmSessionId }
  )

  if (!input.queuedBehindTaskId) {
    await triggerTaskExecution(input.swarmSessionId, task.id)
    return { delivered: true, started: true, blockedByDependencies: false }
  }

  return { delivered: true, started: false, blockedByDependencies: false }
}
