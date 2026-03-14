/**
 * 注意力管理器 - Attention Manager
 * 
 * 创新点：让LLM像人类一样"自主决定"是否中断当前工作
 * 
 * 传统做法：
 * - 消息到达 -> 立即处理（导致打断）
 * - 或 简单优先级队列（缺乏智能）
 * 
 * 新做法：
 * - 消息到达 -> 进入收件箱
 * - LLM定期评估："我现在应该处理这个消息吗？"
 * - LLM基于当前工作重要性、消息紧急度做出决策
 * - 如果需要中断，LLM主动保存上下文，处理消息，然后恢复
 */

import {
  type CognitiveRuntime,
  type InboxMessage,
  type MessagePriority,
} from './cognitive-state'
import {
  getCognitiveRuntime,
  transitionState,
  createSnapshot,
  resumeSnapshot,
  markMessageProcessing,
  markMessageCompleted,
  deferMessage,
  reviveDeferredMessages,
  onCognitiveEvent,
} from './cognitive-engine'
import type { ToolExecutor } from '../agent-loop'
import type { ToolDefinition, LLMMessage } from '../llm/types'
import { callLLM, extractToolUseBlocks, extractTextContent } from '../llm/client'

// 注意力决策结果
export interface AttentionDecision {
  shouldProcess: boolean
  shouldInterrupt: boolean
  shouldBatch: boolean
  shouldSaveContext: boolean
  reasoning: string
  messagesToProcess: string[] // message ids
  messagesToDefer: string[]
}

// 当前工作上下文
export interface CurrentWorkContext {
  type: 'replying_user' | 'evaluating_task' | 'planning' | 'coordination' | 'idle' | 'executing_task' | 'processing_messages'
  description: string
  progress: number
  canBeInterrupted: boolean
  estimatedTimeToComplete: 'seconds' | 'minutes' | 'long'
  partialResult?: string
  thinking?: string
}

/**
 * 启动注意力循环 - 这是Agent的"意识"在运行
 */
export async function startAttentionLoop(
  swarmSessionId: string,
  agentId: string,
  options: {
    llmConfig: {
      systemPrompt: string
      agentName: string
      tools: unknown[]
      executeTool: ToolExecutor
    }
    onProcessMessages: (messages: InboxMessage[], context: CurrentWorkContext) => Promise<unknown>
    checkIntervalMs?: number
  }
): Promise<() => void> {
  const { llmConfig, onProcessMessages, checkIntervalMs = 500 } = options

  let isRunning = true

  // 订阅认知事件（仅用于日志记录）
  const unsubStateChange = onCognitiveEvent('state_changed', (payload, runtime) => {
    if (runtime.agentId !== agentId || runtime.swarmSessionId !== swarmSessionId) {
      return
    }
    const { from, to, reason } = payload as { from: string; to: string; reason: string }
    console.log(`[AttentionManager][${agentId}] State: ${from} -> ${to} (${reason})`)
  })

  // 处理锁，防止并发处理消息
  let isProcessing = false

  // 主动注意力检查循环
  const checkLoop = async () => {
    while (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))

      // 如果正在处理消息，跳过本次检查
      if (isProcessing) continue

      const runtime = getCognitiveRuntime(swarmSessionId, agentId)
      if (!runtime) continue

      if (runtime.inbox.pending.length === 0 && runtime.inbox.deferred.length > 0) {
        reviveDeferredMessages(swarmSessionId, agentId)
      }

      if (runtime.inbox.pending.length === 0) continue

      const currentWorkContext = runtime.currentWorkContext ?? {
        type: 'idle',
        description: 'Agent is idle',
        progress: 0,
        canBeInterrupted: true,
        estimatedTimeToComplete: 'seconds',
      }

      if (canEvaluateInbox(runtime.currentState)) {
        isProcessing = true
        try {
          await checkAndDecide(runtime, currentWorkContext, llmConfig, onProcessMessages)
        } catch (err) {
          console.error(`[AttentionManager][${agentId}] Error in checkLoop:`, err)
        } finally {
          isProcessing = false
        }
      }
    }
  }

  checkLoop().catch((err) => {
    console.error(`[AttentionManager][${agentId}] Loop error:`, err)
  })

  // 返回清理函数
  return () => {
    isRunning = false
    unsubStateChange()
  }
}

/**
 * 更新当前工作上下文（由外部调用，比如AgentLoop）
 */
export function updateWorkContext(
  swarmSessionId: string,
  agentId: string,
  context: Partial<CurrentWorkContext>
): void {
  const runtime = getCognitiveRuntime(swarmSessionId, agentId)
  if (runtime) {
    runtime.currentWorkContext = {
      ...(runtime.currentWorkContext ?? {
        type: 'idle',
        description: 'Agent is idle',
        progress: 0,
        canBeInterrupted: true,
        estimatedTimeToComplete: 'seconds',
      }),
      ...context,
    }
  }
}

/**
 * 让LLM做出注意力决策并直接执行
 * 
 * 这是认知收件箱的核心创新：Agent像人类一样"自主决定"是否中断当前工作
 * - LLM评估当前工作状态和收件箱消息
 * - 基于工作重要性、消息紧急度做出决策
 * - 支持中断、批量、延迟等多种策略
 */
async function checkAndDecide(
  runtime: CognitiveRuntime,
  currentContext: CurrentWorkContext,
  llmConfig: {
    systemPrompt: string
    agentName: string
    tools: unknown[]
    executeTool: ToolExecutor
  },
  onProcessMessages: (messages: InboxMessage[], context: CurrentWorkContext) => Promise<unknown>
): Promise<void> {
  // 过滤出待处理的消息
  const pendingMessages = runtime.inbox.pending.filter((m) => m.status === 'pending')
  if (pendingMessages.length === 0) return

  if (pendingMessages.every(shouldSilentlyIgnoreMessage)) {
    for (const message of pendingMessages) {
      markMessageCompleted(runtime.swarmSessionId, runtime.agentId, message.id, { ignored: true, reason: 'low_priority_broadcast' })
    }
    return
  }

  // 构建决策提示
  const prompt = buildAttentionDecisionPrompt(
    pendingMessages,
    currentContext,
    runtime.currentState
  )

  // 准备 LLM 调用
  const messages: LLMMessage[] = [
    { role: 'user', content: prompt }
  ]

  try {
    // 调用 LLM 做出决策
    const response = await callLLM({
      systemPrompt: '你是一个智能注意力管理助手，帮助Agent决定如何处理收件箱中的消息。',
      messages,
      tools: attentionDecisionTools,
      model: process.env.ATTENTION_MANAGER_MODEL || undefined,
    })

    // 提取工具调用决策
    const toolCalls = extractToolUseBlocks(response)
    const decisionTool = toolCalls.find(t => t.name === 'decide_attention')

    let decision: AttentionDecision

    if (decisionTool) {
      // 使用工具调用的决策
      const result = decisionTool.input
      const action = result.action as string
      const messageIds = (result.messageIds as string[]) || []
      const shouldSaveContext = (result.shouldSaveContext as boolean) || false

      decision = {
        shouldProcess: action === 'process_now' || action === 'batch',
        shouldInterrupt: action === 'process_now' && runtime.currentState === 'FOCUSED',
        shouldBatch: action === 'batch',
        shouldSaveContext,
        reasoning: result.reasoning as string || 'LLM decision via tool call',
        messagesToProcess: action === 'ignore' ? [] : messageIds,
        messagesToDefer: pendingMessages
          .filter((m) => !messageIds.includes(m.id))
          .map((m) => m.id),
      }
    } else {
      // 回退：解析文本响应
      const text = extractTextContent(response)
      decision = parseAttentionDecision(text, pendingMessages)
    }

    console.log(`[AttentionManager][${runtime.agentId}] LLM Decision:`, {
      action: decision.shouldProcess ? (decision.shouldBatch ? 'batch' : 'process_now') : 'defer',
      reasoning: decision.reasoning,
      messageCount: decision.messagesToProcess.length,
    })

    // 如果决定处理消息，先筛选出要处理的消息对象（在执行决策前）
    if (decision.shouldProcess && decision.messagesToProcess.length > 0) {
      // 在执行决策前获取消息对象（markMessageProcessing 会改变状态，但不会移除消息）
      const messagesToProcess = pendingMessages.filter(m =>
        decision.messagesToProcess.includes(m.id)
      )

      console.log(`[AttentionManager][${runtime.agentId}] Processing ${messagesToProcess.length} messages (requested: ${decision.messagesToProcess.length})`)

      if (messagesToProcess.length === 0) {
        console.warn(`[AttentionManager][${runtime.agentId}] No messages found to process, IDs:`, decision.messagesToProcess)
        console.warn(`[AttentionManager][${runtime.agentId}] Pending messages:`, pendingMessages.map(m => ({ id: m.id, status: m.status })))

        // Fallback: 如果 LLM 想处理但给错了 ID，默认处理第一条 pending 消息
        if (decision.shouldProcess && pendingMessages.length > 0) {
          console.warn(`[AttentionManager][${runtime.agentId}] Fallback: processing first pending message`)
          const fallbackMessages = [pendingMessages[0]]
          await executeAttentionDecision(runtime, { ...decision, messagesToProcess: [pendingMessages[0].id] }, pendingMessages)
          await handleProcessNow(runtime, fallbackMessages, currentContext, llmConfig, onProcessMessages)
        }
      } else {
        // 执行决策（标记消息为 processing）
        await executeAttentionDecision(runtime, decision, pendingMessages)

        if (decision.shouldBatch) {
          await handleBatchProcess(runtime, messagesToProcess, currentContext, llmConfig, onProcessMessages)
        } else {
          await handleProcessNow(runtime, messagesToProcess, currentContext, llmConfig, onProcessMessages)
        }
      }
    } else if (!decision.shouldProcess) {
      // 执行延迟决策
      await executeAttentionDecision(runtime, decision, pendingMessages)
    }
  } catch (err) {
    console.error(`[AttentionManager][${runtime.agentId}] LLM decision failed, falling back to rule-based:`, err)
    // LLM 失败时回退到基于规则的决策
    const fallbackDecision = makeAttentionDecision(runtime, pendingMessages)
    if (fallbackDecision === 'process_now' && pendingMessages.length > 0) {
      await handleProcessNow(runtime, pendingMessages.slice(0, 1), currentContext, llmConfig, onProcessMessages)
    } else if (fallbackDecision === 'batch' && pendingMessages.length > 0) {
      await handleBatchProcess(runtime, pendingMessages.slice(0, 5), currentContext, llmConfig, onProcessMessages)
    }
  }
}

/**
 * 基于规则快速做出注意力决策（无需 LLM）
 */
function shouldSilentlyIgnoreMessage(message: InboxMessage): boolean {
  return message.type === 'broadcast'
    && (message.priority === 'low' || message.priority === 'background')
}

function makeAttentionDecision(
  runtime: CognitiveRuntime,
  pendingMessages: InboxMessage[]
): 'process_now' | 'batch' | 'defer' | 'ignore' {
  if (pendingMessages.length === 0) return 'ignore'

  if (pendingMessages.every(shouldSilentlyIgnoreMessage)) {
    return 'ignore'
  }

  // 检查是否有 critical 消息
  const hasCritical = pendingMessages.some(m => m.priority === 'critical')
  if (hasCritical) return 'process_now'

  // 根据状态决定
  switch (runtime.currentState) {
    case 'IDLE':
      // 空闲状态：如果消息数量达到批处理阈值则批量处理，否则立即处理
      if (pendingMessages.length >= runtime.config.batchMaxCount) {
        return 'batch'
      }
      return 'process_now'

    case 'PROCESSING':
      // 处理中：检查是否允许中断
      if (runtime.config.stateBehaviors.PROCESSING.allowInterruption) {
        const hasHighPriority = pendingMessages.some(m => m.priority === 'high')
        if (hasHighPriority) return 'process_now'
      }
      return 'defer'

    case 'FOCUSED':
      // 深度工作中：只有 high/critical 优先级才能中断
      if (runtime.config.stateBehaviors.FOCUSED.allowInterruption) {
        const hasInterruptible = pendingMessages.some(m =>
          m.priority === 'high' || m.priority === 'critical'
        )
        if (hasInterruptible) return 'process_now'
      }
      return 'defer'

    case 'BATCHING':
      // 批量收集中：检查窗口时间
      const oldestMessage = pendingMessages[0]
      const elapsed = Date.now() - oldestMessage.receivedAt.getTime()
      if (elapsed >= runtime.config.batchTimeWindowMs) {
        return 'batch'
      }
      return 'defer'

    default:
      return 'defer'
  }
}

/**
 * 构建注意力决策提示
 * 
 * 核心创新：让 LLM 像人类一样评估是否应该中断当前工作
 * 考虑因素：
 * - 当前工作状态（空闲/处理中/深度工作）
 * - 消息优先级和紧急度
 * - 工作可中断性
 * - 消息等待时间
 */
function buildAttentionDecisionPrompt(
  messages: InboxMessage[],
  currentContext: CurrentWorkContext,
  currentState: string
): string {
  const messageSummary = messages
    .slice(0, 10)
    .map((m) => {
      const time = Math.round((Date.now() - m.receivedAt.getTime()) / 1000)
      return `- ID: ${m.id}
    优先级: [${(m.priority ?? 'normal').toUpperCase()}]
    来自: ${m.senderName} (${m.source})
    类型: ${m.type}
    内容: ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}
    等待时间: ${time}秒`
    })
    .join('\n\n')

  return `## 注意力决策时刻

### 当前工作状态
- 状态: ${currentState}
- 工作类型: ${currentContext.type}
- 工作描述: ${currentContext.description}
- 完成进度: ${currentContext.progress}%
- 是否可中断: ${currentContext.canBeInterrupted ? '是' : '否'}
- 预计完成时间: ${currentContext.estimatedTimeToComplete}
${currentContext.partialResult ? `- 部分结果: ${currentContext.partialResult.slice(0, 200)}...` : ''}

### 收件箱中的消息 (${messages.length}条)
${messageSummary}
${messages.length > 10 ? `\n... 还有 ${messages.length - 10} 条消息` : ''}

### 决策选项
请使用工具做出决策：

1. **process_now** - 立即处理特定消息（可能中断当前工作）
2. **defer** - 延迟处理，稍后决定
3. **batch** - 批量处理多条消息
4. **ignore** - 忽略（消息不够重要）

### 决策原则
- 如果当前工作"可中断"且消息优先级为high/critical → process_now
- 如果有多条normal优先级消息 → batch
- 如果当前工作不可中断 → defer
- 自主判断，给出理由

请做出决策并说明理由。`
}

/**
 * 注意力决策工具
 * 
 * LLM 使用此工具来明确表达其决策，包括：
 * - action: 要采取的行动
 * - reasoning: 决策理由
 * - messageIds: 要处理的消息ID
 * - shouldSaveContext: 是否需要保存上下文
 */
const attentionDecisionTools: ToolDefinition[] = [
  {
    name: 'decide_attention',
    description: '决定如何处理收件箱中的消息',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['process_now', 'defer', 'batch', 'ignore'],
          description: '决策动作',
        },
        reasoning: {
          type: 'string',
          description: '决策理由',
        },
        messageIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要处理的消息ID列表',
        },
        shouldSaveContext: {
          type: 'boolean',
          description: '是否需要保存当前工作上下文（如果要中断的话）',
        },
      },
      required: ['action', 'reasoning', 'messageIds'],
    },
  },
]

/**
 * 构建注意力工具执行器
 * 
 * 当 LLM 决定使用 decide_attention 工具时，此执行器处理工具调用
 * 注：当前使用直接解析，此函数为未来需要复杂工具调用链时保留
 */
function _buildAttentionToolExecutor(
  runtime: CognitiveRuntime,
  pendingMessages: InboxMessage[],
  _currentContext: CurrentWorkContext
): ToolExecutor {
  return async (name: string, input: Record<string, unknown>) => {
    switch (name) {
      case 'decide_attention': {
        const action = input.action as string
        const messageIds = (input.messageIds as string[]) || []
        const shouldSaveContext = (input.shouldSaveContext as boolean) || false

        // 验证消息ID
        const validMessages = pendingMessages.filter((m) => messageIds.includes(m.id))

        return JSON.stringify({
          action,
          validMessageCount: validMessages.length,
          shouldSaveContext,
          pendingCount: pendingMessages.length,
        })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}

/**
 * 解析注意力决策
 * 
 * 当 LLM 以纯文本形式返回决策时，解析其意图
 * 支持关键词匹配（如 "process_now", "batch", "defer" 等）
 */
function parseAttentionDecision(
  finalText: string,
  pendingMessages: InboxMessage[]
): AttentionDecision {
  // 尝试从文本中提取决策
  // 简单实现：基于关键词和消息优先级

  const lowerText = finalText.toLowerCase()

  // 检查是否有明确的batch指示
  const shouldBatch = lowerText.includes('batch') || lowerText.includes('批量')

  // 检查是否应该立即处理
  const shouldProcess =
    lowerText.includes('process_now') ||
    lowerText.includes('立即') ||
    lowerText.includes('马上')

  // 检查是否应该中断
  const shouldInterrupt =
    lowerText.includes('interrupt') ||
    lowerText.includes('中断') ||
    lowerText.includes('打断')

  // 获取要处理的消息（取最高优先级的）
  const sorted = [...pendingMessages].sort((a, b) => {
    const weightA = getPriorityWeight(a.priority ?? 'normal')
    const weightB = getPriorityWeight(b.priority ?? 'normal')
    return weightB - weightA
  })

  const messagesToProcess = shouldProcess ? sorted.slice(0, shouldBatch ? 5 : 1).map((m) => m.id) : []

  return {
    shouldProcess: shouldProcess || shouldBatch,
    shouldInterrupt,
    shouldBatch,
    shouldSaveContext: shouldInterrupt, // 如果需要中断，建议保存上下文
    reasoning: finalText.slice(0, 200),
    messagesToProcess,
    messagesToDefer: pendingMessages
      .filter((m) => !messagesToProcess.includes(m.id))
      .map((m) => m.id),
  }
}

/**
 * 执行注意力决策
 *
 * 根据 LLM 的决策执行相应的操作：
 * - shouldProcess=false: 延迟所有消息
 * - shouldInterrupt=true: 中断当前工作并保存上下文
 * - 标记选中的消息为处理中
 */
async function executeAttentionDecision(
  runtime: CognitiveRuntime,
  decision: AttentionDecision,
  _messages: InboxMessage[]
): Promise<void> {
  if (!decision.shouldProcess) {
    // 对低优先级广播类消息执行静默忽略，避免反复 revive -> defer 造成日志风暴。
    for (const msgId of decision.messagesToDefer) {
      const message = _messages.find(msg => msg.id === msgId)
      if (message && shouldSilentlyIgnoreMessage(message)) {
        markMessageCompleted(runtime.swarmSessionId, runtime.agentId, msgId, { ignored: true })
        continue
      }

      deferMessage(runtime.swarmSessionId, runtime.agentId, msgId, decision.reasoning)
    }
    return
  }

  if (decision.shouldInterrupt && runtime.currentState === 'FOCUSED') {
    // 需要先中断当前工作
    const success = transitionState(
      runtime.swarmSessionId,
      runtime.agentId,
      'INTERRUPTED',
      decision.reasoning
    )

    if (success && decision.shouldSaveContext) {
      // 保存上下文
      await createSnapshot(runtime.swarmSessionId, runtime.agentId, 'Work interrupted by messages', {
        currentTask: {
          type: 'interrupted_task',
          description: 'Work was interrupted to handle messages',
          progress: 50,
        },
        conversationContext: {
          messages: [],
        },
      })
    }
  }

  // 标记消息为处理中
  for (const msgId of decision.messagesToProcess) {
    markMessageProcessing(runtime.swarmSessionId, runtime.agentId, msgId)
  }
}

/**
 * 处理立即执行的消息
 */
async function handleProcessNow(
  runtime: CognitiveRuntime,
  messages: InboxMessage[],
  currentContext: CurrentWorkContext,
  _llmConfig: {
    systemPrompt: string
    agentName: string
    tools: unknown[]
    executeTool: ToolExecutor
  },
  onProcessMessages: (messages: InboxMessage[], context: CurrentWorkContext) => Promise<unknown>
): Promise<void> {
  const initialState = runtime.currentState
  const wasInterrupted = initialState === 'INTERRUPTED'

  if (initialState === 'INTERRUPTED') {
    transitionState(runtime.swarmSessionId, runtime.agentId, 'PROCESSING', 'Handling interrupt message')
  } else if (initialState === 'IDLE' || initialState === 'BATCHING' || initialState === 'COMPLETED' || initialState === 'RECOVERING') {
    transitionState(runtime.swarmSessionId, runtime.agentId, 'PROCESSING', 'Processing messages')
  }

  const deepWork = isDeepWorkContext(currentContext)
  if (deepWork && runtime.currentState === 'PROCESSING') {
    transitionState(runtime.swarmSessionId, runtime.agentId, 'FOCUSED', 'Starting focused work')
  }

  try {
    await onProcessMessages(messages, currentContext)

    // 标记消息完成
    for (const msg of messages) {
      markMessageCompleted(runtime.swarmSessionId, runtime.agentId, msg.id)
    }
  } catch (error) {
    console.error(`[AttentionManager] Error processing messages:`, error)
  } finally {
    if (runtime.contextStack.length > 0) {
      await resumeSnapshot(runtime.swarmSessionId, runtime.agentId)
      transitionState(runtime.swarmSessionId, runtime.agentId, 'FOCUSED', 'Resumed previous work')
    } else if (deepWork && runtime.currentState === 'FOCUSED') {
      transitionState(runtime.swarmSessionId, runtime.agentId, 'COMPLETED', 'Focused work completed')
      transitionState(runtime.swarmSessionId, runtime.agentId, 'IDLE', 'Context cleaned up')
    } else if (wasInterrupted) {
      transitionState(runtime.swarmSessionId, runtime.agentId, 'FOCUSED', 'Resumed previous work')
    } else {
      if (runtime.currentState === 'PROCESSING' || runtime.currentState === 'BATCHING' || runtime.currentState === 'COMPLETED') {
        transitionState(runtime.swarmSessionId, runtime.agentId, 'IDLE', 'Work completed')
      } else if (runtime.currentState !== 'IDLE') {
        transitionState(runtime.swarmSessionId, runtime.agentId, 'COMPLETED', 'Work completed')
        transitionState(runtime.swarmSessionId, runtime.agentId, 'IDLE', 'Context cleaned up')
      }
    }
  }
}

/**
 * 批量处理消息
 */
async function handleBatchProcess(
  runtime: CognitiveRuntime,
  messages: InboxMessage[],
  currentContext: CurrentWorkContext,
  llmConfig: {
    systemPrompt: string
    agentName: string
    tools: unknown[]
    executeTool: ToolExecutor
  },
  onProcessMessages: (messages: InboxMessage[], context: CurrentWorkContext) => Promise<unknown>
): Promise<void> {
  // 只有在非 PROCESSING 状态时才切换到 BATCHING
  // 如果已经在 PROCESSING，直接处理消息而不改变状态
  if (runtime.currentState !== 'PROCESSING') {
    transitionState(runtime.swarmSessionId, runtime.agentId, 'BATCHING', 'Batch processing messages')
  }

  // 使用传入的消息，而不是重新获取
  // 注意：传入的 messages 已经在 checkAndDecide 中被标记为 processing
  await handleProcessNow(runtime, messages, currentContext, llmConfig, onProcessMessages)
}

/**
 * 获取优先级权重
 */
function getPriorityWeight(priority: MessagePriority): number {
  const weights: Record<MessagePriority, number> = {
    critical: 1000,
    high: 100,
    normal: 10,
    low: 1,
    background: 0,
  }
  return weights[priority] || 0
}

function canEvaluateInbox(state: CognitiveRuntime['currentState']): boolean {
  return state === 'IDLE' || state === 'PROCESSING' || state === 'FOCUSED' || state === 'BATCHING' || state === 'INTERRUPTED'
}

function isDeepWorkContext(context: CurrentWorkContext): boolean {
  return context.type === 'executing_task'
    || context.type === 'planning'
    || context.type === 'evaluating_task'
    || context.estimatedTimeToComplete !== 'seconds'
}
