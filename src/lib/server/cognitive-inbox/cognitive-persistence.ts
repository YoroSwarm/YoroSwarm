/**
 * 认知持久化 - Cognitive Persistence
 *
 * 负责将运行时状态（执行、快照）序列化/反序列化，
 * 以及从持久化的 AgentContext 条目中恢复运行时。
 */

import type {
  CognitiveRuntime,
  AgentExecution,
  ContextSnapshot,
  CognitiveState,
} from './cognitive-state'
import { appendAgentContextEntry, listAgentContextEntries } from '../agent-context'

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export async function hydrateRuntimeFromContext(runtime: CognitiveRuntime): Promise<void> {
  const entries = await listAgentContextEntries(runtime.agentId, 200)
  if (entries.length === 0) {
    return
  }

  const executionMap = new Map<string, AgentExecution>()
  const executionOrder: string[] = []
  const snapshotMap = new Map<string, ContextSnapshot>()

  for (const entry of entries.slice().reverse()) {
    const metadata = parseContextMetadata(entry.metadata)
    if (!metadata) continue

    if (entry.entryType === 'runtime_execution') {
      const execution = parsePersistedExecution(metadata.execution)
      if (!execution) continue

      if (!executionMap.has(execution.id)) {
        executionOrder.push(execution.id)
      }
      executionMap.set(execution.id, execution)
      continue
    }

    if (entry.entryType === 'runtime_snapshot') {
      const snapshot = parsePersistedSnapshot(metadata.snapshot)
      const lifecycle = typeof metadata.lifecycle === 'string' ? metadata.lifecycle : null
      if (!snapshot || !lifecycle) continue

      if (lifecycle === 'created') {
        snapshotMap.set(snapshot.id, snapshot)
      } else if (lifecycle === 'resumed') {
        snapshotMap.delete(snapshot.id)
      }
    }
  }

  runtime.executionHistory = executionOrder
    .map(id => executionMap.get(id))
    .filter((execution): execution is AgentExecution => !!execution)

  runtime.contextStack = Array.from(snapshotMap.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const lastExecution = runtime.executionHistory.at(-1)
  if (!lastExecution) {
    return
  }

  if (lastExecution.status === 'active') {
    lastExecution.status = 'interrupted'
    lastExecution.interruptedAt = new Date()
    lastExecution.updatedAt = new Date()
    lastExecution.lastInterruptReason = 'Recovered from persisted runtime context'
  }

  if (lastExecution.status === 'interrupted') {
    runtime.currentExecution = lastExecution
    runtime.currentState = 'RECOVERING'
    runtime.stateChangedAt = new Date()
    runtime.currentWorkContext = buildWorkContextFromExecution(lastExecution)
  }
}

// ---------------------------------------------------------------------------
// Persist helpers
// ---------------------------------------------------------------------------

export async function persistExecutionEvent(
  runtime: CognitiveRuntime,
  lifecycle: 'started' | 'interrupted' | 'resumed' | 'completed' | 'cancelled',
  execution: AgentExecution,
  extraMetadata?: Record<string, unknown>
): Promise<void> {
  await appendAgentContextEntry({
    swarmSessionId: runtime.swarmSessionId,
    agentId: runtime.agentId,
    sourceType: 'runtime',
    sourceId: execution.id,
    entryType: 'runtime_execution',
    content: `execution:${lifecycle}:${execution.description}`,
    metadata: {
      lifecycle,
      execution: serializeExecution(execution),
      ...extraMetadata,
    },
  })
}

export async function persistSnapshotEvent(
  runtime: CognitiveRuntime,
  lifecycle: 'created' | 'resumed',
  snapshot: ContextSnapshot
): Promise<void> {
  await appendAgentContextEntry({
    swarmSessionId: runtime.swarmSessionId,
    agentId: runtime.agentId,
    sourceType: 'runtime',
    sourceId: snapshot.id,
    entryType: 'runtime_snapshot',
    content: `snapshot:${lifecycle}:${snapshot.reason}`,
    metadata: {
      lifecycle,
      snapshot: serializeSnapshot(snapshot),
    },
  })
}

// ---------------------------------------------------------------------------
// Serialization / Parsing (internal)
// ---------------------------------------------------------------------------

function serializeExecution(execution: AgentExecution): Record<string, unknown> {
  return {
    ...execution,
    startedAt: execution.startedAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
    completedAt: execution.completedAt?.toISOString(),
    interruptedAt: execution.interruptedAt?.toISOString(),
    resumedAt: execution.resumedAt?.toISOString(),
  }
}

function parsePersistedExecution(value: unknown): AgentExecution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.kind !== 'string' || typeof raw.status !== 'string' || typeof raw.description !== 'string') {
    return null
  }

  return {
    id: raw.id,
    kind: raw.kind as AgentExecution['kind'],
    status: raw.status as AgentExecution['status'],
    startedAt: parseDate(raw.startedAt) || new Date(),
    updatedAt: parseDate(raw.updatedAt) || new Date(),
    completedAt: parseDate(raw.completedAt),
    interruptedAt: parseDate(raw.interruptedAt),
    resumedAt: parseDate(raw.resumedAt),
    workUnitKey: typeof raw.workUnitKey === 'string' ? raw.workUnitKey : undefined,
    description: raw.description,
    sourceMessageIds: Array.isArray(raw.sourceMessageIds) ? raw.sourceMessageIds.filter((v): v is string => typeof v === 'string') : [],
    interruptionCount: typeof raw.interruptionCount === 'number' ? raw.interruptionCount : 0,
    lastInterruptReason: typeof raw.lastInterruptReason === 'string' ? raw.lastInterruptReason : undefined,
  }
}

function serializeSnapshot(snapshot: ContextSnapshot): Record<string, unknown> {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    resumedAt: snapshot.resumedAt?.toISOString(),
  }
}

function parsePersistedSnapshot(value: unknown): ContextSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.agentId !== 'string' || typeof raw.swarmSessionId !== 'string' || typeof raw.reason !== 'string') {
    return null
  }

  return {
    id: raw.id,
    agentId: raw.agentId,
    swarmSessionId: raw.swarmSessionId,
    createdAt: parseDate(raw.createdAt) || new Date(),
    state: (raw.state as CognitiveState) || 'IDLE',
    reason: raw.reason,
    currentTask: raw.currentTask as ContextSnapshot['currentTask'],
    conversationContext: (raw.conversationContext as ContextSnapshot['conversationContext']) || { messages: [] },
    pendingToolCalls: raw.pendingToolCalls as ContextSnapshot['pendingToolCalls'],
    resumedAt: parseDate(raw.resumedAt),
    resumeAttempts: typeof raw.resumeAttempts === 'number' ? raw.resumeAttempts : 0,
    isDiscarded: raw.isDiscarded === true,
    executionId: typeof raw.executionId === 'string' ? raw.executionId : undefined,
  }
}

function parseContextMetadata(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function buildWorkContextFromExecution(execution: AgentExecution): CognitiveRuntime['currentWorkContext'] {
  return {
    type: execution.kind === 'message_batch'
      ? 'processing_messages'
      : execution.kind === 'deep_work'
        ? 'executing_task'
        : execution.kind === 'idle'
          ? 'idle'
          : 'planning',
    description: execution.description,
    progress: execution.status === 'completed' ? 100 : 50,
    canBeInterrupted: true,
    estimatedTimeToComplete: execution.kind === 'message_batch' ? 'seconds' : 'minutes',
    executionId: execution.id,
    workUnitKey: execution.workUnitKey,
    sourceMessageIds: execution.sourceMessageIds,
  }
}
