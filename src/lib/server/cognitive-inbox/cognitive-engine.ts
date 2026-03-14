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
  PriorityWeights,
} from './cognitive-state'
import { EventEmitter } from 'events'

// 内存中的运行时存储
const runtimes = new Map<string, CognitiveRuntime>()

// 事件发射器
const cognitiveEvents = new EventEmitter()

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
    stats: {
      totalMessagesProcessed: 0,
      totalSnapshotsCreated: 0,
      totalSnapshotsResumed: 0,
      averageProcessingTimeMs: 0,
      interruptionCount: 0,
    },
    config: buildDefaultConfig(options.config),
  }

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
  }

  runtime.contextStack.push(snapshot)
  runtime.stats.totalSnapshotsCreated++

  emitEvent('snapshot_created', { snapshot }, runtime)

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

  runtime.currentSnapshot = snapshot

  emitEvent('snapshot_resumed', { snapshot }, runtime)

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
    runtime.inbox.completed.push(messageId)
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
export function reviveDeferredMessages(
  swarmSessionId: string,
  agentId: string,
  limit?: number
): number {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (!runtime || runtime.inbox.deferred.length === 0) return 0

  const count = typeof limit === 'number'
    ? Math.min(limit, runtime.inbox.deferred.length)
    : runtime.inbox.deferred.length

  const messages = runtime.inbox.deferred.splice(0, count)
  for (const message of messages) {
    message.status = 'pending'
    runtime.inbox.pending.push(message)
  }

  runtime.inbox.pending.sort((a, b) =>
    PriorityWeights[b.priority ?? 'normal'] - PriorityWeights[a.priority ?? 'normal']
  )

  return messages.length
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
    'PROCESSING': ['IDLE', 'FOCUSED'],
    'FOCUSED': ['INTERRUPTED', 'COMPLETED'],
    'INTERRUPTED': ['PROCESSING', 'FOCUSED'],
    'BATCHING': ['PROCESSING'],
    'RECOVERING': ['FOCUSED', 'IDLE'],
    'COMPLETED': ['IDLE'],
  }

  return validTransitions[from]?.includes(to) || false
}

function emitEvent(
  type: CognitiveEvent['type'],
  payload: unknown,
  runtime: CognitiveRuntime
): void {
  cognitiveEvents.emit(type, payload, runtime)
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

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
