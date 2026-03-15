/**
 * 认知收件箱架构 - 核心数据模型
 * 
 * 创新点：
 * 1. Agent有自己的"收件箱"，所有消息先进入这里
 * 2. Agent有认知状态，可以决定何时处理消息
 * 3. 支持上下文堆栈，可保存/恢复工作状态
 * 4. 注意力管理机制，决定消息优先级
 */

// ============================================
// 认知状态定义
// ============================================
export type CognitiveState = 
  | 'IDLE'           // 空闲，可立即响应
  | 'PROCESSING'     // 处理中（轻量）
  | 'FOCUSED'        // 深度工作（可被打断但需评估）
  | 'INTERRUPTED'    // 被中断中
  | 'BATCHING'       // 批量收集中
  | 'RECOVERING'     // 恢复之前工作中
  | 'COMPLETED'      // 工作已完成

// 状态转换配置
export interface StateTransition {
  from: CognitiveState
  to: CognitiveState
  trigger: string
  requiresSnapshot?: boolean  // 是否需要保存上下文
}

// ============================================
// Runtime 消息控制语义
// ============================================
export type InboxMessagePlane = 'control' | 'work'

export type InboxMessageInterruption = 'none' | 'soft' | 'hard'

export interface InboxMessageRuntimeControl {
  plane?: InboxMessagePlane
  interruption?: InboxMessageInterruption
  expiresAt?: string
  workUnitKey?: string
  supersedesPending?: boolean
  supersedesMessageIds?: string[]
  controlType?: 'pause_execution' | 'resume_execution' | 'cancel_execution' | 'supersede_execution' | string
}

export type InboxMessageMetadata = Record<string, unknown> & {
  runtimeControl?: InboxMessageRuntimeControl
}

export function getRuntimeControlMetadata(
  metadata?: Record<string, unknown> | null
): InboxMessageRuntimeControl {
  const runtimeControl = metadata?.runtimeControl
  if (!runtimeControl || typeof runtimeControl !== 'object' || Array.isArray(runtimeControl)) {
    return {}
  }

  return runtimeControl as InboxMessageRuntimeControl
}

export function mergeRuntimeControlMetadata(
  metadata: Record<string, unknown> | null | undefined,
  runtimeControl: InboxMessageRuntimeControl
): InboxMessageMetadata {
  const base = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
    ? { ...metadata }
    : {}

  return {
    ...base,
    runtimeControl: {
      ...getRuntimeControlMetadata(base),
      ...runtimeControl,
    },
  }
}

export function getMessagePlane(message: Pick<InboxMessage, 'metadata' | 'type' | 'source'>): InboxMessagePlane {
  const runtimeControl = getRuntimeControlMetadata(message.metadata)
  if (runtimeControl.plane) {
    return runtimeControl.plane
  }

  if (message.source === 'user' || message.type === 'task_complete' || message.type === 'urgent') {
    return 'control'
  }

  return 'work'
}

export function getInterruptionMode(
  message: Pick<InboxMessage, 'metadata' | 'type' | 'source'>
): InboxMessageInterruption {
  const runtimeControl = getRuntimeControlMetadata(message.metadata)
  if (runtimeControl.interruption) {
    return runtimeControl.interruption
  }

  if (message.source === 'user' || message.type === 'urgent' || message.type === 'task_complete') {
    return 'hard'
  }

  if (message.type === 'question' || message.type === 'coordination' || message.type === 'task_assignment') {
    return 'soft'
  }

  return 'none'
}

export function getWorkUnitKey(message: Pick<InboxMessage, 'metadata'>): string | null {
  const workUnitKey = getRuntimeControlMetadata(message.metadata).workUnitKey
  return typeof workUnitKey === 'string' && workUnitKey.trim().length > 0
    ? workUnitKey
    : null
}

export function shouldSupersedePending(message: Pick<InboxMessage, 'metadata'>): boolean {
  return getRuntimeControlMetadata(message.metadata).supersedesPending === true
}

export function getMessageExpiry(message: Pick<InboxMessage, 'metadata'>): Date | null {
  const expiresAt = getRuntimeControlMetadata(message.metadata).expiresAt
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return null
  }

  const parsed = new Date(expiresAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function isMessageExpired(
  message: Pick<InboxMessage, 'metadata'>,
  now: Date = new Date()
): boolean {
  const expiry = getMessageExpiry(message)
  return !!expiry && expiry.getTime() <= now.getTime()
}

export function isHardInterruptMessage(
  message: Pick<InboxMessage, 'metadata' | 'type' | 'source'>
): boolean {
  return getInterruptionMode(message) === 'hard'
}

// ============================================
// 收件箱消息模型
// ============================================
export interface InboxMessage {
  id: string
  agentId: string
  swarmSessionId: string
  
  // 消息来源
  source: 'user' | 'teammate' | 'system' | 'self'
  senderId: string
  senderName: string
  
  // 消息内容
  type: 'direct_message' | 'task_assignment' | 'task_complete' | 
        'question' | 'urgent' | 'broadcast' | 'coordination'
  content: string
  metadata?: InboxMessageMetadata
  
  // 时间属性
  receivedAt: Date
  priority?: MessagePriority
  
  // 处理状态
  status: 'pending' | 'processing' | 'deferred' | 'completed' | 'ignored'
  processedAt?: Date
  
  // 批处理相关
  batchId?: string
  batchOrder?: number
}

// 消息优先级
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low' | 'background'

// 优先级权重（用于排序）
export const PriorityWeights: Record<MessagePriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
  background: 0,
}

// ============================================
// 上下文快照（支持中断/恢复）
// ============================================
export interface ContextSnapshot {
  id: string
  agentId: string
  swarmSessionId: string
  
  // 快照信息
  createdAt: Date
  state: CognitiveState
  reason: string  // 为什么保存快照
  
  // 工作内容
  currentTask?: {
    type: string
    description: string
    progress: number  // 0-100
    partialResult?: string
  }
  
  // LLM上下文（messages数组的序列化形式）
  conversationContext: {
    messages: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool'
      content: string | unknown[]
      tool_calls?: unknown[]
    }>
    systemPrompt?: string
    thinkingContent?: string
  }
  
  // 工具执行状态
  pendingToolCalls?: Array<{
    toolUseId: string
    toolName: string
    input: unknown
  }>
  
  // 恢复状态
  resumedAt?: Date
  resumeAttempts: number
  isDiscarded: boolean
  executionId?: string
}

export interface AgentExecution {
  id: string
  kind: 'message_batch' | 'deep_work' | 'tool_driven' | 'recovery' | 'idle'
  status: 'active' | 'interrupted' | 'completed' | 'cancelled'
  startedAt: Date
  updatedAt: Date
  completedAt?: Date
  interruptedAt?: Date
  resumedAt?: Date
  workUnitKey?: string
  description: string
  sourceMessageIds: string[]
  interruptionCount: number
  lastInterruptReason?: string
}

// ============================================
// 注意力管理配置
// ============================================
export interface AttentionConfig {
  // 各状态下的默认行为
  stateBehaviors: Record<CognitiveState, {
    allowInterruption: boolean
    maxDeferredMessages: number
    batchWindowMs: number  // 批量收集窗口
  }>
  
  // 消息类型到优先级的映射（可自定义）
  priorityRules: Array<{
    condition: (msg: InboxMessage, currentState: CognitiveState) => boolean
    priority: MessagePriority
    interrupt: boolean  // 是否强制中断当前工作
  }>
  
  // 批处理策略
  batchingStrategy: 'time' | 'count' | 'smart' | 'none'
  batchTimeWindowMs: number
  batchMaxCount: number
}

// ============================================
// Agent认知运行时
// ============================================
export interface CognitiveRuntime {
  agentId: string
  swarmSessionId: string
  
  // 当前状态
  currentState: CognitiveState
  stateChangedAt: Date
  
  // 收件箱
  inbox: {
    pending: InboxMessage[]
    processing?: InboxMessage
    deferred: InboxMessage[]
    completed: string[]  // message ids
  }
  
  // 上下文堆栈
  contextStack: ContextSnapshot[]
  currentSnapshot?: ContextSnapshot
  currentWorkContext?: {
    type: 'replying_user' | 'evaluating_task' | 'planning' | 'coordination' | 'idle' | 'executing_task' | 'processing_messages'
    description: string
    progress: number
    canBeInterrupted: boolean
    estimatedTimeToComplete: 'seconds' | 'minutes' | 'long'
    partialResult?: string
    thinking?: string
    executionId?: string
    workUnitKey?: string
    sourceMessageIds?: string[]
  }
  currentExecution?: AgentExecution
  executionHistory: AgentExecution[]
  
  // 统计数据
  stats: {
    totalMessagesProcessed: number
    totalSnapshotsCreated: number
    totalSnapshotsResumed: number
    averageProcessingTimeMs: number
    interruptionCount: number
  }
  
  // 配置
  config: AttentionConfig
}

// ============================================
// 认知循环事件
// ============================================
export type CognitiveEvent = 
  | { type: 'message_received'; message: InboxMessage }
  | { type: 'state_changed'; from: CognitiveState; to: CognitiveState; reason: string }
  | { type: 'snapshot_created'; snapshot: ContextSnapshot }
  | { type: 'snapshot_resumed'; snapshot: ContextSnapshot }
  | { type: 'execution_started'; execution: AgentExecution }
  | { type: 'execution_interrupted'; execution: AgentExecution; reason: string }
  | { type: 'execution_completed'; execution: AgentExecution }
  | { type: 'batch_ready'; messages: InboxMessage[]; batchId: string }
  | { type: 'attention_decision'; messages: InboxMessage[]; decision: 'process_now' | 'defer' | 'batch' | 'ignore' }
  | { type: 'processing_complete'; message: InboxMessage; result: unknown }
