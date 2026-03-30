/**
 * 认知引擎 - Cognitive Engine
 * 
 * Agent的核心"大脑"，管理：
 * 1. 收件箱消息的接收和排队
 * 2. 认知状态的转换
 * 3. 上下文快照的保存和恢复
 * 4. 注意力分配决策
 */

import {
  type CognitiveState,
  type CognitiveRuntime,
  type InboxMessage,
  type ContextSnapshot,
  type CognitiveEvent,
  type AttentionConfig,
  type MessagePriority,
  type InboxMessageMetadata,
  type InboxMessageRuntimeControl,
  type AgentExecution,
  PriorityWeights,
} from './cognitive-state'
import { EventEmitter } from 'events'
import { hydrateRuntimeFromContext, persistExecutionEvent, persistSnapshotEvent } from './cognitive-persistence'
import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'

// 内存中的运行时存储
const runtimes = new Map<string, CognitiveRuntime>()

// 事件发射器
const cognitiveEvents = new EventEmitter()

const MAX_COMPLETED_MESSAGE_IDS = 2000
const MAX_CONTEXT_STACK_SIZE = 20
const MAX_EXECUTION_HISTORY_SIZE = 200

function trimArrayToSize<T>(items: T[], maxSize: number): void {
  if (items.length <= maxSize) return
  items.splice(0, items.length - maxSize)
}

function rememberCompletedMessage(runtime: CognitiveRuntime, messageId: string): void {
  runtime.inbox.completed.push(messageId)
  trimArrayToSize(runtime.inbox.completed, MAX_COMPLETED_MESSAGE_IDS)
}

function persistRuntimeEventSafely(
  promise: Promise<void>,
  context: { swarmSessionId: string; agentId: string; event: string }
): void {
  promise.catch((error) => {
    console.error(
      `[CognitiveEngine] Failed to persist ${context.event} for ${context.swarmSessionId}:${context.agentId}:`,
      error
    )
  })
}

export interface CognitiveEngineOptions {
  agentId: string
  swarmSessionId: string
  config?: Partial<AttentionConfig>
}

/**
 * 初始化或获取Agent的认知运行时
 */
export async function initCognitiveEngine(
  options: CognitiveEngineOptions
): Promise<CognitiveRuntime> {
  const key = `${options.swarmSessionId}:${options.agentId}`
  
  if (runtimes.has(key)) {
    return runtimes.get(key)!
  }

  const runtime: CognitiveRuntime = {
    agentId: options.agentId,
    swarmSessionId: options.swarmSessionId,
    currentState: 'IDLE',
    stateChangedAt: new Date(),
    inbox: {
      pending: [],
      deferred: [],
      completed: [],
    },
    contextStack: [],
    currentWorkContext: {
      type: 'idle',
      description: 'Agent is idle',
      progress: 0,
      canBeInterrupted: true,
      estimatedTimeToComplete: 'seconds',
    },
    executionHistory: [],
    stats: {
      totalMessagesProcessed: 0,
      totalSnapshotsCreated: 0,
      totalSnapshotsResumed: 0,
      averageProcessingTimeMs: 0,
      interruptionCount: 0,
    },
    config: buildDefaultConfig(options.config),
  }

  await hydrateRuntimeFromContext(runtime)

  runtimes.set(key, runtime)
  
  // 启动认知循环
  startCognitiveLoop(runtime)
  
  return runtime
}

/**
 * 获取Agent的认知运行时
 */
export function getCognitiveRuntime(
  swarmSessionId: string,
  agentId: string
): CognitiveRuntime | undefined {
  const key = `${swarmSessionId}:${agentId}`
  return runtimes.get(key)
}

/**
 * 销毁Agent的认知运行时（用于暂停/清理场景）
 *
 * 从内存中移除 runtime，使下次 initCognitiveEngine 创建全新实例。
 * 调用前应先持久化 inbox 状态。
 */
export function destroyRuntime(
  swarmSessionId: string,
  agentId: string
): void {
  const key = `${swarmSessionId}:${agentId}`
  const runtime = runtimes.get(key)
  if (runtime) {
    // Clear all message queues to prevent memory leaks
    runtime.inbox.pending = []
    runtime.inbox.deferred = []
    runtime.inbox.completed = []
    runtime.contextStack = []
    runtime.currentSnapshot = undefined
    runtime.executionHistory = []

    // Reset state to idle before deletion
    runtime.currentState = 'IDLE'
    runtime.currentExecution = undefined
    runtime.currentWorkContext = {
      type: 'idle',
      description: 'Agent is idle',
      progress: 0,
      canBeInterrupted: true,
      estimatedTimeToComplete: 'seconds',
    }
  }
  runtimes.delete(key)
}

/**
 * 重置 runtime 中卡死的 processing 消息为 pending 状态
 *
 * 用于恢复场景：暂停时正在处理的消息可能保持 processing 状态，
 * 需要在恢复时重置为 pending 以便重新处理。
 */
export function resetProcessingMessages(
  swarmSessionId: string,
  agentId: string
): number {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return 0

  let resetCount = 0
  for (const message of runtime.inbox.pending) {
    if (message.status === 'processing') {
      message.status = 'pending'
      resetCount++
    }
  }

  // 清除悬空的 processing 引用
  runtime.inbox.processing = undefined

  // 重置悬空的 currentExecution
  if (runtime.currentExecution?.status === 'active') {
    runtime.currentExecution.status = 'interrupted'
    runtime.currentExecution.interruptedAt = new Date()
    runtime.currentExecution.updatedAt = new Date()
    runtime.currentExecution.lastInterruptReason = 'Session paused'
    runtime.currentExecution.interruptionCount += 1
  }

  return resetCount
}

/**
 * 投递消息到Agent的收件箱
 * 
 * 这是所有消息进入Agent的唯一入口
 */
export async function deliverMessage(
  swarmSessionId: string,
  agentId: string,
  message: Omit<InboxMessage, 'id' | 'status' | 'receivedAt'>
): Promise<InboxMessage> {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) {
    throw new Error(`Cognitive runtime not found for agent ${agentId}`)
  }

  const inboxMessage: InboxMessage = {
    ...message,
    id: generateMessageId(),
    status: 'pending',
    receivedAt: new Date(),
    metadata: normalizeInboxMetadata(message.metadata),
  }

  if (isMessageExpired(inboxMessage)) {
    inboxMessage.status = 'ignored'
    rememberCompletedMessage(runtime, inboxMessage.id)
    return inboxMessage
  }

  if (shouldSupersedePendingMessages(inboxMessage)) {
    supersedeMessages(runtime, inboxMessage)
  }

  // 根据当前状态和消息类型评估优先级（如果未指定）
  inboxMessage.priority = inboxMessage.priority ?? evaluatePriority(inboxMessage, runtime.currentState, runtime.config)

  // 添加到收件箱
  runtime.inbox.pending.push(inboxMessage)
  
  // 按优先级排序
  runtime.inbox.pending.sort((a, b) => 
    PriorityWeights[b.priority ?? 'normal'] - PriorityWeights[a.priority ?? 'normal']
  )

  // 触发事件
  emitEvent('message_received', { message: inboxMessage }, runtime)

  return inboxMessage
}

/**
 * 创建上下文快照（保存当前工作状态）
 */
export async function createSnapshot(
  swarmSessionId: string,
  agentId: string,
  reason: string,
  context: {
    currentTask?: ContextSnapshot['currentTask']
    conversationContext: ContextSnapshot['conversationContext']
    pendingToolCalls?: ContextSnapshot['pendingToolCalls']
  }
): Promise<ContextSnapshot> {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) {
    throw new Error(`Cognitive runtime not found for agent ${agentId}`)
  }

  const snapshot: ContextSnapshot = {
    id: generateSnapshotId(),
    agentId,
    swarmSessionId,
    createdAt: new Date(),
    state: runtime.currentState,
    reason,
    currentTask: context.currentTask,
    conversationContext: context.conversationContext,
    pendingToolCalls: context.pendingToolCalls,
    resumeAttempts: 0,
    isDiscarded: false,
    executionId: runtime.currentExecution?.id,
  }

  runtime.contextStack.push(snapshot)
  trimArrayToSize(runtime.contextStack, MAX_CONTEXT_STACK_SIZE)
  runtime.stats.totalSnapshotsCreated++

  emitEvent('snapshot_created', { snapshot }, runtime)
  await persistSnapshotEvent(runtime, 'created', snapshot)

  return snapshot
}

/**
 * 恢复最近的上下文快照
 */
export async function resumeSnapshot(
  swarmSessionId: string,
  agentId: string
): Promise<ContextSnapshot | null> {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) {
    throw new Error(`Cognitive runtime not found for agent ${agentId}`)
  }

  // 找到最近的未废弃快照
  const snapshot = runtime.contextStack
    .slice()
    .reverse()
    .find(s => !s.isDiscarded)

  if (!snapshot) {
    return null
  }

  snapshot.resumedAt = new Date()
  snapshot.resumeAttempts++
  runtime.stats.totalSnapshotsResumed++

  // 从堆栈中移除已恢复的快照
  const index = runtime.contextStack.findIndex(s => s.id === snapshot.id)
  if (index !== -1) {
    runtime.contextStack.splice(index, 1)
  }

  runtime.currentSnapshot = {
    ...snapshot,
    conversationContext: {
      ...snapshot.conversationContext,
      messages: [],
    },
  }

  if (snapshot.executionId && runtime.currentExecution?.id === snapshot.executionId) {
    resumeExecution(swarmSessionId, agentId, {
      description: snapshot.currentTask?.description,
    })
  }

  emitEvent('snapshot_resumed', { snapshot }, runtime)
  await persistSnapshotEvent(runtime, 'resumed', snapshot)

  return snapshot
}

/**
 * 获取下一条待处理的消息
 */
export function peekNextMessage(
  swarmSessionId: string,
  agentId: string
): InboxMessage | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return null

  pruneInvalidMessages(runtime)

  return runtime.inbox.pending[0] || null
}

/**
 * 获取一批待处理的消息（用于批量处理）
 */
export function getMessageBatch(
  swarmSessionId: string,
  agentId: string,
  maxCount: number = 5
): InboxMessage[] {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return []

  pruneInvalidMessages(runtime)

  const messages: InboxMessage[] = []
  const candidates = [...runtime.inbox.pending]
  
  // 如果第一条是critical，只返回这一条
  if (candidates[0]?.priority === 'critical') {
    return [candidates[0]]
  }

  // 按优先级分组
  const byPriority = groupBy(candidates, m => m.priority ?? 'normal')
  
  // 按优先级顺序取消息
  const priorities: MessagePriority[] = ['high', 'normal', 'low', 'background']
  for (const priority of priorities) {
    const group = byPriority[priority] || []
    for (const msg of group) {
      if (messages.length >= maxCount) break
      messages.push(msg)
    }
    if (messages.length >= maxCount) break
  }

  return messages
}

/**
 * 标记消息为处理中
 */
export function markMessageProcessing(
  swarmSessionId: string,
  agentId: string,
  messageId: string
): void {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return

  const message = runtime.inbox.pending.find(m => m.id === messageId)
  if (message) {
    if (isMessageInvalid(runtime, message)) {
      markMessageCompleted(swarmSessionId, agentId, message.id, { ignored: true, reason: 'invalid_runtime_message' })
      return
    }

    message.status = 'processing'
    runtime.inbox.processing = message
  }
}

/**
 * 完成消息处理
 */
export function markMessageCompleted(
  swarmSessionId: string,
  agentId: string,
  messageId: string,
  result?: unknown
): void {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return

  const index = runtime.inbox.pending.findIndex(m => m.id === messageId)
  if (index !== -1) {
    const message = runtime.inbox.pending[index]
    message.status = 'completed'
    message.processedAt = new Date()
    runtime.inbox.pending.splice(index, 1)
    rememberCompletedMessage(runtime, messageId)
    runtime.inbox.processing = undefined
    runtime.stats.totalMessagesProcessed++

    emitEvent('processing_complete', { message, result }, runtime)
  }
}

/**
 * 延迟消息处理（稍后处理）
 */
export function deferMessage(
  swarmSessionId: string,
  agentId: string,
  messageId: string,
  reason: string
): void {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return

  // 记录延迟原因（用于调试）
  console.log(`[CognitiveEngine] Deferring message ${messageId}: ${reason}`)

  const index = runtime.inbox.pending.findIndex(m => m.id === messageId)
  if (index !== -1) {
    const message = runtime.inbox.pending[index]
    message.status = 'deferred'
    runtime.inbox.pending.splice(index, 1)
    runtime.inbox.deferred.push(message)
  }
}

/**
 * 将延迟队列中的消息重新放回待处理队列
 */
function shouldDropDeferredMessage(message: InboxMessage): boolean {
  const trimmed = message.content.replace(/\s+/g, ' ').trim()
  const runtimeControl = getRuntimeControl(message)
  const isLowPriority = message.priority === 'low' || message.priority === 'background'
  const isWelcomeLike = message.type === 'broadcast'
    || /欢迎来到团队|欢迎新成员|team update|welcome to the team|请欢迎新队友/i.test(trimmed)

  if (!trimmed) {
    return true
  }

  if (isWelcomeLike && isLowPriority) {
    return true
  }

  return runtimeControl.plane === 'work' && message.type === 'broadcast' && isLowPriority
}

export function reviveDeferredMessages(
  swarmSessionId: string,
  agentId: string,
  limit?: number
): number {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime || runtime.inbox.deferred.length === 0) return 0

  pruneInvalidMessages(runtime)

  if (runtime.inbox.deferred.length === 0) return 0

  const maxReviveCount = typeof limit === 'number'
    ? Math.min(limit, runtime.inbox.deferred.length)
    : runtime.inbox.deferred.length

  const deferred = runtime.inbox.deferred
  const retainedDeferred: InboxMessage[] = []
  const messagesToRevive: InboxMessage[] = []

  for (const message of deferred) {
    if (shouldDropDeferredMessage(message)) {
      message.status = 'completed'
      message.processedAt = new Date()
      rememberCompletedMessage(runtime, message.id)
      continue
    }

    if (messagesToRevive.length < maxReviveCount) {
      messagesToRevive.push(message)
      continue
    }

    retainedDeferred.push(message)
  }

  runtime.inbox.deferred = retainedDeferred

  for (const message of messagesToRevive) {
    message.status = 'pending'
    runtime.inbox.pending.push(message)
  }

  runtime.inbox.pending.sort((a, b) =>
    PriorityWeights[b.priority ?? 'normal'] - PriorityWeights[a.priority ?? 'normal']
  )

  return messagesToRevive.length
}

export function getRuntimeControl(message: InboxMessage): InboxMessageRuntimeControl {
  return normalizeInboxMetadata(message.metadata)?.runtimeControl ?? {}
}

export function startExecution(
  swarmSessionId: string,
  agentId: string,
  input: {
    kind: AgentExecution['kind']
    description: string
    workUnitKey?: string
    sourceMessageIds?: string[]
  }
): AgentExecution | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return null

  const now = new Date()
  const current = runtime.currentExecution
  if (current && current.status === 'active') {
    current.updatedAt = now
    current.description = input.description || current.description
    current.workUnitKey = input.workUnitKey ?? current.workUnitKey
    current.sourceMessageIds = input.sourceMessageIds?.length ? input.sourceMessageIds : current.sourceMessageIds
    return current
  }

  const execution: AgentExecution = {
    id: generateExecutionId(),
    kind: input.kind,
    status: 'active',
    startedAt: now,
    updatedAt: now,
    workUnitKey: input.workUnitKey,
    description: input.description,
    sourceMessageIds: input.sourceMessageIds || [],
    interruptionCount: 0,
  }

  runtime.currentExecution = execution
  runtime.executionHistory.push(execution)
  trimArrayToSize(runtime.executionHistory, MAX_EXECUTION_HISTORY_SIZE)
  emitEvent('execution_started', { execution }, runtime)
  persistRuntimeEventSafely(
    persistExecutionEvent(runtime, 'started', execution),
    { swarmSessionId, agentId, event: 'execution_started' }
  )
  return execution
}

export function interruptExecution(
  swarmSessionId: string,
  agentId: string,
  reason: string
): AgentExecution | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  const execution = runtime?.currentExecution
  if (!runtime || !execution || execution.status !== 'active') {
    return null
  }

  const now = new Date()
  execution.status = 'interrupted'
  execution.interruptedAt = now
  execution.updatedAt = now
  execution.interruptionCount += 1
  execution.lastInterruptReason = reason
  runtime.stats.interruptionCount += 1

  emitEvent('execution_interrupted', { execution, reason }, runtime)
  persistRuntimeEventSafely(
    persistExecutionEvent(runtime, 'interrupted', execution, { reason }),
    { swarmSessionId, agentId, event: 'execution_interrupted' }
  )
  return execution
}

export function resumeExecution(
  swarmSessionId: string,
  agentId: string,
  input?: {
    description?: string
    sourceMessageIds?: string[]
  }
): AgentExecution | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  const execution = runtime?.currentExecution
  if (!runtime || !execution) {
    return null
  }

  const now = new Date()
  execution.status = 'active'
  execution.resumedAt = now
  execution.updatedAt = now
  if (input?.description) execution.description = input.description
  if (input?.sourceMessageIds?.length) execution.sourceMessageIds = input.sourceMessageIds
  persistRuntimeEventSafely(
    persistExecutionEvent(runtime, 'resumed', execution),
    { swarmSessionId, agentId, event: 'execution_resumed' }
  )
  return execution
}

export function completeExecution(
  swarmSessionId: string,
  agentId: string,
  status: Extract<AgentExecution['status'], 'completed' | 'cancelled'> = 'completed'
): AgentExecution | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  const execution = runtime?.currentExecution
  if (!runtime || !execution) {
    return null
  }

  const now = new Date()
  execution.status = status
  execution.completedAt = now
  execution.updatedAt = now
  runtime.currentExecution = undefined

  emitEvent('execution_completed', { execution }, runtime)
  persistRuntimeEventSafely(
    persistExecutionEvent(runtime, status, execution),
    { swarmSessionId, agentId, event: `execution_${status}` }
  )
  return execution
}

export function isControlPlaneMessage(message: InboxMessage): boolean {
  return getRuntimeControl(message).plane === 'control'
}

export function isHardInterruptMessage(message: InboxMessage): boolean {
  return getRuntimeControl(message).interruption === 'hard'
}

export function isSoftInterruptMessage(message: InboxMessage): boolean {
  return getRuntimeControl(message).interruption === 'soft'
}

export function isMessageExpired(message: InboxMessage, now: Date = new Date()): boolean {
  const expiresAt = getRuntimeControl(message).expiresAt
  if (!expiresAt) return false

  const expiresMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresMs)) return false

  return expiresMs <= now.getTime()
}

export function shouldSupersedePendingMessages(message: InboxMessage): boolean {
  const control = getRuntimeControl(message)
  return !!(control.supersedesPending || control.supersedesMessageIds?.length)
}

export function pruneInvalidMessages(
  runtimeOrSession: CognitiveRuntime | string,
  maybeAgentId?: string
): number {
  const runtime = typeof runtimeOrSession === 'string'
    ? getCognitiveRuntime(runtimeOrSession, maybeAgentId || '')
    : runtimeOrSession

  if (!runtime) return 0

  let prunedCount = 0
  const now = new Date()

  runtime.inbox.pending = runtime.inbox.pending.filter(message => {
    if (!isMessageInvalid(runtime, message)) {
      return true
    }

    markMessageIgnored(runtime, message, now)
    prunedCount++
    return false
  })

  runtime.inbox.deferred = runtime.inbox.deferred.filter(message => {
    if (!isMessageInvalid(runtime, message)) {
      return true
    }

    markMessageIgnored(runtime, message, now)
    prunedCount++
    return false
  })

  return prunedCount
}

/**
 * 转换认知状态
 */
export function transitionState(
  swarmSessionId: string,
  agentId: string,
  newState: CognitiveState,
  reason: string
): boolean {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime) return false

  const oldState = runtime.currentState

  // 如果状态没有变化，直接返回成功（幂等）
  if (oldState === newState) {
    return true
  }

  // 检查状态转换是否合法
  if (!isValidTransition(oldState, newState)) {
    console.warn(`[CognitiveEngine] Invalid state transition: ${oldState} -> ${newState}`)
    return false
  }

  runtime.currentState = newState
  runtime.stateChangedAt = new Date()

  emitEvent('state_changed', { from: oldState, to: newState, reason }, runtime)

  return true
}

/**
 * 获取当前状态
 */
export function getCurrentState(
  swarmSessionId: string,
  agentId: string
): CognitiveState | null {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  return runtime?.currentState || null
}

/**
 * 订阅认知事件
 */
export function onCognitiveEvent(
  event: CognitiveEvent['type'],
  handler: (payload: unknown, runtime: CognitiveRuntime) => void
): () => void {
  cognitiveEvents.on(event, handler)
  return () => cognitiveEvents.off(event, handler)
}

// ============================================
// 私有辅助函数
// ============================================

function startCognitiveLoop(runtime: CognitiveRuntime): void {
  // 注意：注意力循环现在由 attention-manager.ts 中的 startAttentionLoop 管理
  // 此函数保留用于未来扩展，当前不执行任何操作
  // 避免双重触发问题（之前这里会触发 attention_decision 事件）
  void runtime
}

function evaluatePriority(
  message: InboxMessage,
  currentState: CognitiveState,
  config: AttentionConfig
): MessagePriority {
  const control = getRuntimeControl(message)
  if (control.interruption === 'hard') {
    return 'critical'
  }
  if (control.plane === 'control' || control.interruption === 'soft') {
    return 'high'
  }

  // 运行自定义规则
  for (const rule of config.priorityRules) {
    if (rule.condition(message, currentState)) {
      return rule.priority
    }
  }

  // 默认规则
  switch (message.type) {
    case 'urgent':
      return 'critical'
    case 'task_complete':
      return 'high'
    case 'question':
      return message.source === 'user' ? 'high' : 'normal'
    case 'direct_message':
      return message.source === 'user' ? 'high' : 'normal'
    case 'task_assignment':
      return 'normal'
    case 'coordination':
      return 'normal'
    case 'broadcast':
      return 'low'
    default:
      return 'normal'
  }
}

function isValidTransition(from: CognitiveState, to: CognitiveState): boolean {
  const validTransitions: Record<CognitiveState, CognitiveState[]> = {
    'IDLE': ['PROCESSING', 'BATCHING'],
    'PROCESSING': ['IDLE', 'FOCUSED', 'INTERRUPTED', 'COMPLETED', 'BATCHING'],
    'FOCUSED': ['INTERRUPTED', 'COMPLETED', 'PROCESSING', 'IDLE'],
    'INTERRUPTED': ['PROCESSING', 'FOCUSED', 'RECOVERING', 'IDLE'],
    'BATCHING': ['PROCESSING', 'IDLE', 'COMPLETED'],
    'RECOVERING': ['FOCUSED', 'IDLE'],
    'COMPLETED': ['IDLE', 'PROCESSING', 'FOCUSED'],
  }

  return validTransitions[from]?.includes(to) || false
}

function emitEvent(
  type: CognitiveEvent['type'],
  payload: unknown,
  runtime: CognitiveRuntime
): void {
  cognitiveEvents.emit(type, payload, runtime)
  void publishExecutionRealtime(type, payload, runtime)
}

async function publishExecutionRealtime(
  type: CognitiveEvent['type'],
  payload: unknown,
  runtime: CognitiveRuntime
): Promise<void> {
  if (type !== 'execution_started' && type !== 'execution_interrupted' && type !== 'execution_completed') {
    return
  }

  const execution = (payload as { execution?: AgentExecution }).execution
  if (!execution) return

  const agent = await prisma.agent.findUnique({
    where: { id: runtime.agentId },
    select: { name: true },
  })

  publishRealtimeMessage(
    {
      type: 'execution_update',
      payload: {
        execution_id: execution.id,
        agent_id: runtime.agentId,
        agent_name: agent?.name || 'Agent',
        swarm_session_id: runtime.swarmSessionId,
        status: execution.status,
        kind: execution.kind,
        description: execution.description,
        work_unit_key: execution.workUnitKey,
        interruption_count: execution.interruptionCount,
        source_message_ids: execution.sourceMessageIds,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: runtime.swarmSessionId }
  )
}

function buildDefaultConfig(overrides?: Partial<AttentionConfig>): AttentionConfig {
  return {
    stateBehaviors: {
      IDLE: { allowInterruption: true, maxDeferredMessages: 10, batchWindowMs: 0 },
      PROCESSING: { allowInterruption: true, maxDeferredMessages: 20, batchWindowMs: 500 },
      FOCUSED: { allowInterruption: true, maxDeferredMessages: 50, batchWindowMs: 1000 },
      INTERRUPTED: { allowInterruption: true, maxDeferredMessages: 30, batchWindowMs: 0 },
      BATCHING: { allowInterruption: true, maxDeferredMessages: 100, batchWindowMs: 3000 },
      RECOVERING: { allowInterruption: false, maxDeferredMessages: 20, batchWindowMs: 0 },
      COMPLETED: { allowInterruption: true, maxDeferredMessages: 10, batchWindowMs: 0 },
    },
    priorityRules: [],
    batchingStrategy: 'smart',
    batchTimeWindowMs: 3000,
    batchMaxCount: 5,
    ...overrides,
  }
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

function normalizeInboxMetadata(metadata?: InboxMessage['metadata']): InboxMessageMetadata | undefined {
  if (!metadata) return undefined

  const runtimeControl = metadata.runtimeControl ?? {}
  return {
    ...metadata,
    runtimeControl: {
      plane: runtimeControl.plane === 'control' ? 'control' : 'work',
      interruption: runtimeControl.interruption === 'hard'
        ? 'hard'
        : runtimeControl.interruption === 'soft'
          ? 'soft'
          : 'none',
      expiresAt: typeof runtimeControl.expiresAt === 'string' ? runtimeControl.expiresAt : undefined,
      workUnitKey: typeof runtimeControl.workUnitKey === 'string' ? runtimeControl.workUnitKey : undefined,
      supersedesPending: runtimeControl.supersedesPending === true,
      supersedesMessageIds: Array.isArray(runtimeControl.supersedesMessageIds)
        ? runtimeControl.supersedesMessageIds.filter((value): value is string => typeof value === 'string')
        : undefined,
      controlType: typeof runtimeControl.controlType === 'string' ? runtimeControl.controlType : undefined,
    },
  }
}

function isMessageInvalid(runtime: CognitiveRuntime, message: InboxMessage): boolean {
  if (message.status === 'processing') {
    return false
  }

  return isMessageExpired(message) || isSupersededByPendingMessage(runtime, message)
}

function isSupersededByPendingMessage(runtime: CognitiveRuntime, message: InboxMessage): boolean {
  return runtime.inbox.pending.some(candidate => {
    if (candidate.id === message.id) return false
    if (candidate.status !== 'pending' && candidate.status !== 'processing') return false
    return doesMessageSupersede(candidate, message)
  })
}

function supersedeMessages(runtime: CognitiveRuntime, incoming: InboxMessage): void {
  const now = new Date()

  runtime.inbox.pending = runtime.inbox.pending.filter(existing => {
    if (existing.status === 'processing') return true
    if (!doesMessageSupersede(incoming, existing)) return true

    markMessageIgnored(runtime, existing, now)
    return false
  })

  runtime.inbox.deferred = runtime.inbox.deferred.filter(existing => {
    if (!doesMessageSupersede(incoming, existing)) return true

    markMessageIgnored(runtime, existing, now)
    return false
  })
}

function doesMessageSupersede(incoming: InboxMessage, existing: InboxMessage): boolean {
  const incomingControl = getRuntimeControl(incoming)
  if (!incomingControl.supersedesPending && !incomingControl.supersedesMessageIds?.length) {
    return false
  }

  if (incomingControl.supersedesMessageIds?.includes(existing.id)) {
    return true
  }

  if (!incomingControl.supersedesPending) {
    return false
  }

  const existingControl = getRuntimeControl(existing)
  return !!incomingControl.workUnitKey
    && incomingControl.workUnitKey === existingControl.workUnitKey
}

function markMessageIgnored(runtime: CognitiveRuntime, message: InboxMessage, now: Date): void {
  message.status = 'ignored'
  message.processedAt = now
  if (!runtime.inbox.completed.includes(message.id)) {
    rememberCompletedMessage(runtime, message.id)
  }

  if (runtime.inbox.processing?.id === message.id) {
    runtime.inbox.processing = undefined
  }
}

