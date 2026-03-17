/**
 * 认知收件箱架构 - 主入口
 * 
 * 这是一个创新的Agent架构，让AI Agent具备：
 * 1. 收件箱 - 所有消息先进入这里，不会立即打断
 * 2. 认知状态 - Agent知道自己在做什么
 * 3. 注意力管理 - 像人类一样决定何时处理消息
 * 4. 上下文堆栈 - 支持中断和恢复工作
 */

// 核心类型
export type {
  CognitiveState,
  CognitiveRuntime,
  InboxMessage,
  InboxMessagePlane,
  InboxMessageInterruption,
  InboxMessageRuntimeControl,
  InboxMessageMetadata,
  AgentExecution,
  ContextSnapshot,
  CognitiveEvent,
  AttentionConfig,
  MessagePriority,
} from './cognitive-state'

export {
  getMessagePlane,
  getInterruptionMode,
  getWorkUnitKey,
  shouldSupersedePending,
} from './cognitive-state'

// 从 attention-manager 导出的类型
export type {
  CurrentWorkContext,
  AttentionDecision,
} from './attention-manager'

// 核心引擎
export {
  initCognitiveEngine,
  getCognitiveRuntime,
  destroyRuntime,
  resetProcessingMessages,
  deliverMessage,
  createSnapshot,
  resumeSnapshot,
  peekNextMessage,
  getMessageBatch,
  markMessageProcessing,
  markMessageCompleted,
  deferMessage,
  startExecution,
  interruptExecution,
  resumeExecution,
  completeExecution,
  getRuntimeControl,
  isControlPlaneMessage,
  isHardInterruptMessage,
  isSoftInterruptMessage,
  isMessageExpired,
  shouldSupersedePendingMessages,
  pruneInvalidMessages,
  transitionState,
  getCurrentState,
  onCognitiveEvent,
} from './cognitive-engine'

// 注意力管理
export {
  startAttentionLoop,
  updateWorkContext,
} from './attention-manager'

// 工具函数
export function createInboxMessage(
  params: Omit<InboxMessage, 'id' | 'status' | 'receivedAt'>
): InboxMessage {
  return {
    ...params,
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'pending',
    receivedAt: new Date(),
  }
}

import type { InboxMessage } from './cognitive-state'
