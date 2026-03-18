/**
 * Swarm Session Lifecycle Management
 * 
 * 负责会话级别的暂停/恢复/自动恢复逻辑：
 * 1. pauseSwarmSession — 暂停整个会话（停止所有 agent 循环，持久化 inbox 状态）
 * 2. resumeSwarmSession — 恢复暂停的会话（重启 agent 循环，恢复 inbox 状态）
 * 3. autoResumeActiveSessions — 服务器启动时自动恢复 ACTIVE 会话
 */

import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import {
  getCognitiveRuntime,
  destroyRuntime,
} from './cognitive-inbox'
import {
  initCognitiveLead,
  cleanupCognitiveLead,
  getCognitiveLeadProcessor,
} from './cognitive-lead-runner'
import {
  getTeammateProcessor,
  cleanupCognitiveTeammate,
  resumeTeammateTask,
} from './cognitive-teammate-runner'
import { persistInboxState, restoreInboxState } from './cognitive-inbox/cognitive-persistence'
import { transitionState } from './cognitive-inbox/cognitive-engine'

// ─────────────────────────────────────────────────────────────────────────────
// Pause
// ─────────────────────────────────────────────────────────────────────────────

export async function pauseSwarmSession(swarmSessionId: string): Promise<{
  pausedAgents: number
  message: string
}> {
  const session = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    include: { agents: true },
  })

  if (!session) throw new Error(`Session not found: ${swarmSessionId}`)
  if (session.status === 'PAUSED') {
    return { pausedAgents: 0, message: '会话已经处于暂停状态' }
  }

  let pausedAgents = 0
  const leadAgentId = session.leadAgentId

  // 1. Persist inbox state for all agents with active runtimes
  for (const agent of session.agents) {
    const runtime = getCognitiveRuntime(swarmSessionId, agent.id)
    if (runtime) {
      try {
        await persistInboxState(runtime)
      } catch (err) {
        console.error(`[Lifecycle] Failed to persist inbox for agent ${agent.id}:`, err)
      }
    }
  }

  // 1.5. Destroy runtimes to prevent stale state on resume
  for (const agent of session.agents) {
    destroyRuntime(swarmSessionId, agent.id)
  }

  // 2. Cleanup Lead processor (stops attention loop)
  if (leadAgentId) {
    cleanupCognitiveLead(swarmSessionId, leadAgentId)
    pausedAgents++
  }

  // 3. Cleanup Teammate processors
  for (const agent of session.agents) {
    if (agent.id === leadAgentId) continue
    const processor = getTeammateProcessor(swarmSessionId, agent.id)
    if (processor) {
      cleanupCognitiveTeammate(swarmSessionId, agent.id)
      pausedAgents++
    }
  }

  // 4. Set all IDLE/BUSY agents to OFFLINE
  await prisma.agent.updateMany({
    where: {
      swarmSessionId,
      status: { in: ['IDLE', 'BUSY'] },
    },
    data: { status: 'OFFLINE' },
  })

  // 5. Update session status
  await prisma.swarmSession.update({
    where: { id: swarmSessionId },
    data: { status: 'PAUSED' },
  })

  // 6. Broadcast status change
  publishRealtimeMessage(
    {
      type: 'session_status',
      payload: {
        session_id: swarmSessionId,
        status: 'paused',
        paused_agents: pausedAgents,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  for (const agent of session.agents) {
    publishRealtimeMessage(
      {
        type: 'agent_status',
        payload: {
          agent_id: agent.id,
          name: agent.name,
          status: 'offline',
          swarm_session_id: swarmSessionId,
          message: '会话已暂停',
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )
  }

  console.log(`[Lifecycle] Paused session ${swarmSessionId}: ${pausedAgents} agents stopped`)
  return { pausedAgents, message: `会话已暂停，${pausedAgents} 个 agent 已停止` }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume
// ─────────────────────────────────────────────────────────────────────────────

export async function resumeSwarmSession(swarmSessionId: string): Promise<{
  resumedAgents: number
  pendingTasks: number
  message: string
}> {
  const session = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    include: {
      agents: true,
      tasks: {
        where: { status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
      },
    },
  })

  if (!session) throw new Error(`Session not found: ${swarmSessionId}`)

  const leadAgentId = session.leadAgentId
  if (!leadAgentId) throw new Error(`Session has no Lead agent: ${swarmSessionId}`)

  let resumedAgents = 0

  // 1. Set session to ACTIVE
  await prisma.swarmSession.update({
    where: { id: swarmSessionId },
    data: { status: 'ACTIVE' },
  })

  // 2. Set agents back to IDLE
  await prisma.agent.updateMany({
    where: {
      swarmSessionId,
      status: 'OFFLINE',
    },
    data: { status: 'IDLE' },
  })

  // 3. Re-initialize Lead cognitive engine
  const existingProcessor = getCognitiveLeadProcessor(swarmSessionId, leadAgentId)
  if (!existingProcessor) {
    try {
      await initCognitiveLead({
        swarmSessionId,
        userId: session.userId,
        leadAgentId,
      })
      resumedAgents++

      // Restore Lead's inbox state from persistence
      const leadRuntime = getCognitiveRuntime(swarmSessionId, leadAgentId)
      if (leadRuntime) {
        const restoredCount = await restoreInboxState(leadRuntime)

        // If runtime is in RECOVERING state from persisted context, transition to IDLE
        // so the attention loop can process restored messages
        if (leadRuntime.currentState === 'RECOVERING') {
          transitionState(
            swarmSessionId,
            leadAgentId,
            'IDLE',
            `Session resumed: ${restoredCount} messages restored, ready to process`
          )
          console.log(
            `[Lifecycle] Session ${swarmSessionId} transitioned from RECOVERING to IDLE (${restoredCount} messages restored)`
          )
        }
      }
    } catch (err) {
      console.error(`[Lifecycle] Failed to resume Lead ${leadAgentId}:`, err)
    }
  }

  // 3.5. Re-initialize teammate processors and restore their state
  const resumedTeammateTaskIds: string[] = []
  for (const agent of session.agents) {
    if (agent.id === leadAgentId) continue

    try {
      // Find IN_PROGRESS tasks assigned to this teammate
      const activeTask = session.tasks.find(
        t => t.assigneeId === agent.id && t.status === 'IN_PROGRESS'
      )

      if (activeTask) {
        // resumeTeammateTask creates the processor (and runtime via initCognitiveEngine)
        await resumeTeammateTask(swarmSessionId, agent.id, activeTask.id, leadAgentId)
        resumedTeammateTaskIds.push(activeTask.id)
        resumedAgents++

        // Restore teammate's inbox state now that runtime exists
        const teammateRuntime = getCognitiveRuntime(swarmSessionId, agent.id)
        if (teammateRuntime) {
          await restoreInboxState(teammateRuntime)
          if (teammateRuntime.currentState === 'RECOVERING') {
            transitionState(
              swarmSessionId,
              agent.id,
              'IDLE',
              'Teammate resumed from pause'
            )
          }
        }

        console.log(
          `[Lifecycle] Resumed teammate ${agent.name} with task "${activeTask.title}"`
        )
      }
    } catch (err) {
      console.error(`[Lifecycle] Failed to resume teammate ${agent.id}:`, err)
    }
  }

  // 4. Broadcast agent status updates
  for (const agent of session.agents) {
    publishRealtimeMessage(
      {
        type: 'agent_status',
        payload: {
          agent_id: agent.id,
          name: agent.name,
          status: 'idle',
          swarm_session_id: swarmSessionId,
          message: '会话已恢复',
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )
  }

  // 5. Broadcast session status
  publishRealtimeMessage(
    {
      type: 'session_status',
      payload: {
        session_id: swarmSessionId,
        status: 'active',
        resumed_agents: resumedAgents,
        pending_tasks: session.tasks.length,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  // 6. Inject a recovery message so Lead picks up where it left off
  const pendingTasks = session.tasks.length
  {
    const { deliverMessage } = await import('./cognitive-inbox')
    const pendingList = session.tasks
      .filter(t => t.status === 'PENDING' && !t.assigneeId)
      .map(t => `- ${t.title}`)
      .join('\n')

    const inProgressList = session.tasks
      .filter(t => (t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED') && !resumedTeammateTaskIds.includes(t.id))
      .map(t => `- [${t.status}] ${t.title}`)
      .join('\n')

    const autoResumedList = session.tasks
      .filter(t => resumedTeammateTaskIds.includes(t.id))
      .map(t => `- [已自动恢复] ${t.title}`)
      .join('\n')

    let content = `[会话恢复] 此会话从暂停状态恢复。`
    if (autoResumedList) content += `\n\n已自动恢复执行的任务：\n${autoResumedList}`
    if (pendingList) content += `\n\n未分配的待处理任务：\n${pendingList}`
    if (inProgressList) content += `\n\n执行中的任务（可能需要重新分配）：\n${inProgressList}`
    if (pendingTasks === 0) {
      content += `\n\n目前没有待处理任务。请检查之前的用户消息并继续工作。`
    } else {
      content += `\n\n请检查任务状态并继续工作。`
    }

    try {
      await deliverMessage(swarmSessionId, leadAgentId, {
        source: 'system',
        senderId: 'system',
        senderName: '系统恢复',
        type: 'system_alert',
        content,
        priority: 'high',
        metadata: {
          autoGenerated: true,
          sessionResumed: true,
          pendingTaskCount: pendingTasks,
        },
        swarmSessionId,
        agentId: leadAgentId,
      })
    } catch (err) {
      console.error(`[Lifecycle] Failed to inject resume message:`, err)
    }
  }

  console.log(
    `[Lifecycle] Resumed session ${swarmSessionId}: ${resumedAgents} agents, ${pendingTasks} pending tasks`
  )

  return {
    resumedAgents,
    pendingTasks,
    message: `会话已恢复，${resumedAgents} 个 agent 已启动，${pendingTasks} 个任务待处理`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Resume on Startup
// ─────────────────────────────────────────────────────────────────────────────

export async function autoResumeActiveSessions(): Promise<{
  resumedSessions: number
  errors: string[]
}> {
  const activeSessions = await prisma.swarmSession.findMany({
    where: { status: 'ACTIVE', archivedAt: null },
    select: {
      id: true,
      userId: true,
      leadAgentId: true,
      title: true,
    },
  })

  if (activeSessions.length === 0) {
    return { resumedSessions: 0, errors: [] }
  }

  console.log(`[Lifecycle] Auto-resuming ${activeSessions.length} active session(s)...`)

  let resumedSessions = 0
  const errors: string[] = []

  for (const session of activeSessions) {
    if (!session.leadAgentId) {
      errors.push(`Session ${session.id} has no Lead agent, skipping`)
      continue
    }

    // Check if the Lead processor is already running (shouldn't be after restart)
    const existing = getCognitiveLeadProcessor(session.id, session.leadAgentId)
    if (existing) {
      continue // Already running
    }

    // Check if session has pending work (tasks or inbox messages)
    const pendingTasks = await prisma.teamLeadTask.count({
      where: {
        swarmSessionId: session.id,
        status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      },
    })

    // Also check for persisted inbox messages that need processing
    const { listAgentContextEntries } = await import('./agent-context')
    const contextEntries = await listAgentContextEntries(session.leadAgentId, 10)
    const hasInboxSnapshot = contextEntries.some(e => e.entryType === 'inbox_snapshot')

    if (pendingTasks === 0 && !hasInboxSnapshot) {
      console.log(
        `[Lifecycle] Skipping idle session "${session.title}" (${session.id}): no pending work`
      )
      continue
    }

    try {
      await initCognitiveLead({
        swarmSessionId: session.id,
        userId: session.userId,
        leadAgentId: session.leadAgentId,
      })

      // Restore inbox state
      const leadRuntime = getCognitiveRuntime(session.id, session.leadAgentId)
      if (leadRuntime) {
        const restoredCount = await restoreInboxState(leadRuntime)

        // If runtime is in RECOVERING state from persisted context, transition to IDLE
        // so the attention loop can process restored messages
        if (leadRuntime.currentState === 'RECOVERING') {
          transitionState(
            session.id,
            session.leadAgentId,
            'IDLE',
            `Session auto-resumed: ${restoredCount} messages restored, ready to process`
          )
          console.log(
            `[Lifecycle] Session ${session.id} transitioned from RECOVERING to IDLE (${restoredCount} messages restored)`
          )
        }
      }

      // Resume teammate tasks that were IN_PROGRESS when server died
      const inProgressTasks = await prisma.teamLeadTask.findMany({
        where: {
          swarmSessionId: session.id,
          status: 'IN_PROGRESS',
          assigneeId: { not: null },
        },
        select: { id: true, title: true, assigneeId: true },
      })

      const resumedTeammateTaskIds: string[] = []
      for (const task of inProgressTasks) {
        if (task.assigneeId && task.assigneeId !== session.leadAgentId) {
          try {
            await resumeTeammateTask(session.id, task.assigneeId, task.id, session.leadAgentId)
            resumedTeammateTaskIds.push(task.id)

            // Restore teammate's inbox state
            const teammateRuntime = getCognitiveRuntime(session.id, task.assigneeId)
            if (teammateRuntime) {
              await restoreInboxState(teammateRuntime)
              if (teammateRuntime.currentState === 'RECOVERING') {
                transitionState(
                  session.id,
                  task.assigneeId,
                  'IDLE',
                  'Teammate auto-resumed after server restart'
                )
              }
            }

            console.log(
              `[Lifecycle] Auto-resumed teammate task "${task.title}" for agent ${task.assigneeId}`
            )
          } catch (err) {
            console.error(`[Lifecycle] Failed to auto-resume teammate task ${task.id}:`, err)
            // If resume fails, reset task to PENDING so Lead can re-assign
            await prisma.teamLeadTask.update({
              where: { id: task.id },
              data: {
                status: 'PENDING',
                assigneeId: null,
                errorSummary: '服务器重启后自动恢复任务失败，已重置为待分配状态',
              },
            })
          }
        }
      }

      if (pendingTasks > 0) {
        const { deliverMessage } = await import('./cognitive-inbox')

        const autoResumedList = inProgressTasks
          .filter(t => resumedTeammateTaskIds.includes(t.id))
          .map(t => `- [已自动恢复] ${t.title}`)
          .join('\n')

        let content = `[服务器重启恢复] 此会话在服务器重启后自动恢复。你有 ${pendingTasks} 个未完成的任务。`
        if (autoResumedList) {
          content += `\n\n已自动从断点恢复执行的任务：\n${autoResumedList}`
        }
        content += `\n\n请检查任务列表并继续工作。`

        await deliverMessage(session.id, session.leadAgentId, {
          source: 'system',
          senderId: 'system',
          senderName: '系统自动恢复',
          type: 'system_alert',
          content,
          priority: 'high',
          metadata: {
            autoGenerated: true,
            serverRestart: true,
            pendingTaskCount: pendingTasks,
            resumedTeammateTasks: resumedTeammateTaskIds,
          },
          swarmSessionId: session.id,
          agentId: session.leadAgentId,
        })
      }

      resumedSessions++
      console.log(
        `[Lifecycle] Auto-resumed session "${session.title}" (${session.id}): ${pendingTasks} tasks, ${resumedTeammateTaskIds.length} teammate tasks resumed`
      )
    } catch (err) {
      const errMsg = `Failed to auto-resume session ${session.id}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(errMsg)
      console.error(`[Lifecycle] ${errMsg}`)
    }
  }

  console.log(
    `[Lifecycle] Auto-resume complete: ${resumedSessions}/${activeSessions.length} sessions resumed`
  )

  return { resumedSessions, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────

let shutdownRegistered = false

export function registerGracefulShutdown(): void {
  if (shutdownRegistered) return
  shutdownRegistered = true

  const gracefulShutdown = (signal: string) => {
    console.log(`[Lifecycle] Received ${signal}, performing graceful shutdown...`)

    // Use immediate execution to ensure synchronous cleanup starts
    void (async () => {
      try {
        // Find all active sessions
        const activeSessions = await prisma.swarmSession.findMany({
          where: { status: 'ACTIVE', archivedAt: null },
          include: { agents: true },
        })

        // First, immediately abort all running processors (synchronous)
        for (const session of activeSessions) {
          try {
            if (session.leadAgentId) {
              cleanupCognitiveLead(session.id, session.leadAgentId)
            }
            for (const agent of session.agents) {
              if (agent.id === session.leadAgentId) continue
              const processor = getTeammateProcessor(session.id, agent.id)
              if (processor) {
                cleanupCognitiveTeammate(session.id, agent.id)
              }
            }
          } catch (err) {
            console.error(`[Lifecycle] Error aborting session ${session.id}:`, err)
          }
        }

        // Then persist inbox states and destroy runtimes
        for (const session of activeSessions) {
          try {
            for (const agent of session.agents) {
              const runtime = getCognitiveRuntime(session.id, agent.id)
              if (runtime) {
                await persistInboxState(runtime)
              }
              destroyRuntime(session.id, agent.id)
            }
            console.log(`[Lifecycle] Gracefully stopped session ${session.id}`)
          } catch (err) {
            console.error(`[Lifecycle] Error persisting session ${session.id}:`, err)
          }
        }
      } catch (err) {
        console.error(`[Lifecycle] Error during graceful shutdown:`, err)
      }

      console.log(`[Lifecycle] Graceful shutdown complete`)
      process.exit(0)
    })()
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  console.log('[Lifecycle] Graceful shutdown handlers registered')
}
