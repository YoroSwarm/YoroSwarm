import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'

async function getInterruptedRuntimeExecutions(swarmSessionId: string): Promise<number> {
  const entries = await prisma.agentContextEntry.findMany({
    where: {
      swarmSessionId,
      entryType: 'runtime_execution',
    },
    orderBy: { sequence: 'desc' },
    take: 500,
    select: {
      sourceId: true,
      metadata: true,
    },
  })

  const latestByExecution = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.sourceId || latestByExecution.has(entry.sourceId)) continue
    const lifecycle = parseRuntimeLifecycle(entry.metadata)
    if (lifecycle) {
      latestByExecution.set(entry.sourceId, lifecycle)
    }
  }

  let interrupted = 0
  for (const lifecycle of latestByExecution.values()) {
    if (lifecycle === 'started' || lifecycle === 'interrupted' || lifecycle === 'resumed') {
      interrupted++
    }
  }

  return interrupted
}

function parseRuntimeLifecycle(metadata: string | null): string | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as { lifecycle?: unknown }
    return typeof parsed.lifecycle === 'string' ? parsed.lifecycle : null
  } catch {
    return null
  }
}

/**
 * Recovery function to clean up stuck agents and tasks after server restart.
 * Should be called on application startup.
 */
export async function recoverStuckState(): Promise<{
  recoveredAgents: number
  recoveredTasks: number
}> {
  let recoveredAgents = 0
  let recoveredTasks = 0

  // 1. Find agents stuck in BUSY status (server died while they were processing)
  // Only recover agents from ACTIVE sessions, keep PAUSED sessions as-is
  const stuckAgents = await prisma.agent.findMany({
    where: {
      status: 'BUSY',
      swarmSession: { status: 'ACTIVE' }
    },
    select: { id: true, name: true, swarmSessionId: true },
  })

  for (const agent of stuckAgents) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: 'IDLE' },
    })
    recoveredAgents++

    if (agent.swarmSessionId) {
      publishRealtimeMessage(
        {
          type: 'agent_status',
          payload: {
            agent_id: agent.id,
            name: agent.name,
            status: 'idle',
            swarm_session_id: agent.swarmSessionId,
            message: '服务器重启后恢复',
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: agent.swarmSessionId }
      )
    }
  }

  // 2. Find tasks stuck in IN_PROGRESS or ASSIGNED (were being processed when server died)
  // Only recover tasks from ACTIVE sessions, keep PAUSED sessions as-is
  const stuckTasks = await prisma.teamLeadTask.findMany({
    where: {
      status: { in: ['IN_PROGRESS', 'ASSIGNED'] },
      swarmSession: { status: 'ACTIVE' }
    },
    select: { id: true, title: true, status: true, swarmSessionId: true, assigneeId: true },
  })

  for (const task of stuckTasks) {
    // Reset to PENDING so they can be reassigned
    await prisma.teamLeadTask.update({
      where: { id: task.id },
      data: {
        status: 'PENDING',
        assigneeId: null,
        errorSummary: `任务在执行中因服务器重启被中断，已重置为待分配状态`,
      },
    })
    recoveredTasks++

    publishRealtimeMessage(
      {
        type: 'task_update',
        payload: {
          task_id: task.id,
          title: task.title,
          status: 'pending',
          swarm_session_id: task.swarmSessionId,
          message: '服务器重启，任务已重置为待分配',
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: task.swarmSessionId }
    )
  }

  if (recoveredAgents > 0 || recoveredTasks > 0) {
    console.log(
      `[Recovery] Recovered ${recoveredAgents} stuck agent(s) and ${recoveredTasks} stuck task(s)`
    )
  }

  return { recoveredAgents, recoveredTasks }
}

/**
 * Resume unfinished work for a specific session.
 * Called when a user returns to a session that has pending tasks.
 */
export async function getSessionRecoveryStatus(swarmSessionId: string): Promise<{
  hasStuckWork: boolean
  pendingTasks: number
  failedTasks: number
  interruptedExecutions: number
  summary: string
}> {
  const [tasks, interruptedExecutions] = await Promise.all([
    prisma.teamLeadTask.findMany({
      where: { swarmSessionId },
      select: { status: true, title: true, errorSummary: true },
    }),
    getInterruptedRuntimeExecutions(swarmSessionId),
  ])

  const pendingTasks = tasks.filter(t => t.status === 'PENDING').length
  const failedTasks = tasks.filter(t => t.status === 'FAILED').length
  const interruptedTasks = tasks.filter(t =>
    t.errorSummary?.includes('服务器重启')
  ).length

  const hasStuckWork = interruptedTasks > 0 || pendingTasks > 0 || interruptedExecutions > 0

  let summary = ''
  if (interruptedExecutions > 0) {
    summary += `${interruptedExecutions} 个 agent execution 可恢复。`
  }
  if (interruptedTasks > 0) {
    summary += `${interruptedTasks} 个任务因服务器重启被中断并重置。`
  }
  if (pendingTasks > 0) {
    summary += `${pendingTasks} 个任务等待分配。`
  }
  if (failedTasks > 0) {
    summary += `${failedTasks} 个任务执行失败。`
  }

  return { hasStuckWork, pendingTasks, failedTasks, interruptedExecutions, summary }
}
