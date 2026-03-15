import type { LLMMessage, ContentBlock } from './llm/types'

// ============================================
// Token 估算与上下文压缩
// ============================================

const CHARS_PER_TOKEN = 3.5 // 中文约 1.5-2 字符/token，英文约 4 字符/token，取中间值
const MAX_CONTEXT_TOKENS = 180000 // 保守上限，留余量给 system prompt 和 output
const COMPRESS_THRESHOLD = 0.7 // 当使用率超过 70% 时开始压缩

/**
 * 估算文本的 token 数量
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * 估算消息数组的总 token 数量
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += estimateTokens(block.text)
        } else if (block.type === 'tool_result') {
          total += estimateTokens(typeof block.content === 'string' ? block.content : '')
        } else if (block.type === 'tool_use') {
          total += estimateTokens(JSON.stringify(block.input))
        }
      }
    }
    total += 4 // message overhead
  }
  return total
}

/**
 * 按优先级截断上下文消息
 * 优先级：最近消息 > 系统上下文 > 工具调用/结果 > 早期对话
 */
export function compressContextMessages(
  messages: LLMMessage[],
  maxTokens: number = MAX_CONTEXT_TOKENS
): LLMMessage[] {
  const totalTokens = estimateMessagesTokens(messages)
  if (totalTokens <= maxTokens * COMPRESS_THRESHOLD) {
    return messages
  }

  // 策略：保留最早 2 条（系统状态）和最后 6 条（最近交互），中间部分截断
  if (messages.length <= 10) {
    return messages // 消息太少，不压缩
  }

  const keepEarly = 2
  const keepRecent = 6
  const earlyMessages = messages.slice(0, keepEarly)
  const recentMessages = messages.slice(-keepRecent)
  const middleMessages = messages.slice(keepEarly, -keepRecent)

  // 对中间消息进行摘要压缩
  const compressedMiddle = compressMiddleMessages(middleMessages, maxTokens - estimateMessagesTokens(earlyMessages) - estimateMessagesTokens(recentMessages))

  return [...earlyMessages, ...compressedMiddle, ...recentMessages]
}

/**
 * 压缩中间部分消息
 */
function compressMiddleMessages(messages: LLMMessage[], budgetTokens: number): LLMMessage[] {
  if (messages.length === 0) return []

  const result: LLMMessage[] = []
  let usedTokens = 0

  // 工具调用对保留完整性很重要，但结果可以截断
  for (const msg of messages) {
    const msgTokens = estimateMessagesTokens([msg])

    if (usedTokens + msgTokens <= budgetTokens) {
      result.push(msg)
      usedTokens += msgTokens
      continue
    }

    // 超出预算，尝试截断内容
    if (typeof msg.content === 'string') {
      const truncatedContent = truncateText(msg.content, Math.max(200, (budgetTokens - usedTokens) * CHARS_PER_TOKEN | 0))
      if (truncatedContent) {
        result.push({ role: msg.role, content: truncatedContent })
        usedTokens += estimateTokens(truncatedContent)
      }
    } else if (Array.isArray(msg.content) && hasToolBlock(msg.content)) {
      // 工具调用/结果保留，但截断结果内容
      const truncatedBlocks = msg.content.map(block => {
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > 500) {
          return { ...block, content: block.content.slice(0, 500) + '\n...(已截断)' }
        }
        return block
      })
      result.push({ role: msg.role, content: truncatedBlocks })
      usedTokens += estimateMessagesTokens([{ role: msg.role, content: truncatedBlocks }])
    }

    if (usedTokens >= budgetTokens * 0.95) break
  }

  if (result.length < messages.length && result.length > 0) {
    const skipped = messages.length - result.length
    pushMessage(result, 'user', `[上下文压缩] 已省略 ${skipped} 条早期消息以节省上下文空间。`)
  }

  return result
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n...(已截断)'
}

type ContextEntryRecord = {
  entryType: string
  content: string
  metadata: string | null
}

type ExternalMessageRecord = {
  senderType: string
  content: string
}

type LeadTaskRecord = {
  id: string
  title: string
  status: string
  description?: string | null
  resultSummary?: string | null
  errorSummary?: string | null
  assignee?: { name: string } | null
}

type LeadTeammateRecord = {
  id: string
  name: string
  role: string
  status: string
  capabilities?: string | null
}

type LeadAttachmentRecord = {
  fileId: string
  fileName: string
  mimeType: string
  size?: number
}

type LeadSelfTodoRecord = {
  id: string
  title: string
  details?: string
  status: string
  category: string
  sourceRef?: string
  updatedAt: string
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function buildTextBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

function hasToolBlock(content: string | ContentBlock[]): boolean {
  return Array.isArray(content) && content.some(block => block.type === 'tool_use' || block.type === 'tool_result')
}

function pushMessage(messages: LLMMessage[], role: 'user' | 'assistant', content: string | ContentBlock[]) {
  if (!content || (typeof content === 'string' && !content.trim())) {
    return
  }

  const last = messages[messages.length - 1]
  if (last && last.role === role) {
    const shouldKeepSeparate = hasToolBlock(last.content) || hasToolBlock(content)
    if (shouldKeepSeparate) {
      messages.push({ role, content })
      return
    }

    if (typeof last.content === 'string' && typeof content === 'string') {
      last.content = `${last.content}

${content}`
      return
    }

    const left = typeof last.content === 'string' ? [buildTextBlock(last.content)] : last.content
    const right = typeof content === 'string' ? [buildTextBlock(content)] : content
    last.content = [...left, ...right]
    return
  }

  messages.push({ role, content })
}

function appendToolContextMessage(messages: LLMMessage[], entry: ContextEntryRecord, metadata: Record<string, unknown>) {
  const toolUseId = typeof metadata.toolUseId === 'string' ? metadata.toolUseId : null
  if (!toolUseId) return

  if (entry.entryType === 'tool_call') {
    pushMessage(messages, 'assistant', [{
      type: 'tool_use',
      id: toolUseId,
      name: typeof metadata.toolName === 'string' ? metadata.toolName : 'unknown_tool',
      input: (metadata.toolInput && typeof metadata.toolInput === 'object' && !Array.isArray(metadata.toolInput))
        ? metadata.toolInput as Record<string, unknown>
        : {},
    }])
    return
  }

  pushMessage(messages, 'user', [{
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: typeof metadata.resultContent === 'string' ? metadata.resultContent : entry.content,
    is_error: metadata.isError === true,
  }])
}

function getToolUseId(entry: ContextEntryRecord): string | null {
  const metadata = parseMetadata(entry.metadata)
  return typeof metadata?.toolUseId === 'string' ? metadata.toolUseId : null
}

function appendToolAwareEntries(messages: LLMMessage[], entries: ContextEntryRecord[]) {
  const toolCallEntries = new Set<string>()
  for (const entry of entries) {
    if (entry.entryType !== 'tool_call') continue
    const toolUseId = getToolUseId(entry)
    if (toolUseId) {
      toolCallEntries.add(toolUseId)
    }
  }

  for (const entry of entries) {
    if (entry.entryType === 'tool_result') {
      const toolUseId = getToolUseId(entry)
      if (!toolUseId || !toolCallEntries.has(toolUseId)) {
        const metadata = parseMetadata(entry.metadata)
        const toolName = typeof metadata?.toolName === 'string' ? metadata.toolName : 'unknown_tool'
        const resultContent = typeof metadata?.resultContent === 'string' ? metadata.resultContent : entry.content
        pushMessage(messages, 'user', `[历史工具结果回退]
- 工具: ${toolName}
- 结果: ${resultContent}`)
        continue
      }
    }

    appendLeadMemoryMessage(messages, entry)
  }
}

function appendLeadMemoryMessage(messages: LLMMessage[], entry: ContextEntryRecord) {
  const metadata = parseMetadata(entry.metadata)

  switch (entry.entryType) {
    case 'assistant_response':
      pushMessage(messages, 'assistant', entry.content)
      return
    case 'task_completion':
      pushMessage(messages, 'user', `[队友汇报]\n${entry.content}`)
      return
    case 'internal_message': {
      const senderName = typeof metadata?.senderAgentId === 'string' ? metadata.senderAgentId : '队友'
      const messageType = typeof metadata?.messageType === 'string' ? metadata.messageType : 'internal_message'
      pushMessage(messages, 'user', `[内部消息][${messageType}] 来自 ${senderName}\n${entry.content}`)
      return
    }
    case 'progress_update':
      pushMessage(messages, 'user', `[进度更新]\n${entry.content}`)
      return
    case 'error':
      pushMessage(messages, 'user', `[系统错误]\n${entry.content}`)
      return
    case 'tool_call':
    case 'tool_result':
      if (metadata) appendToolContextMessage(messages, entry, metadata)
      return
    default:
      return
  }
}

export function renderLeadSelfTodoBoard(selfTodos?: LeadSelfTodoRecord[]): string | null {
  if (!selfTodos || selfTodos.length === 0) {
    return null
  }

  const lines: string[] = [
    '## 当前 Lead Todo',
    '这是当前这一次认知回合结束前必须再次核对的实时待办板。pending / in_progress 代表仍未完成，不能把整体工作当作已交付。',
    '【Todo 使用提示】对于包含多个阶段/交付物的复杂任务（如：分析→汇总→讲稿→PPT），应为每个阶段创建独立的 Todo 项，而不是只用单个 Todo 跟踪全部工作。这样可以清晰展示整体进度。',
  ]

  for (const item of selfTodos) {
    const details = item.details ? ' | ' + item.details : ''
    lines.push('- [' + item.status + '] (' + item.category + ') ' + item.title + details)
  }

  return lines.join('\n')
}

function buildLeadSystemStateMessage(input: {
  teammates: LeadTeammateRecord[]
  tasks: LeadTaskRecord[]
  attachments: LeadAttachmentRecord[]
  selfTodos?: LeadSelfTodoRecord[]
}): string | null {
  const parts: string[] = []
  const selfTodoBoard = renderLeadSelfTodoBoard(input.selfTodos)
  if (selfTodoBoard) {
    parts.push(selfTodoBoard)
  }

  if (input.teammates.length > 0) {
    parts.push('## 当前团队成员')
    parts.push('使用 assign_task 或 send_message_to_teammate 时，请直接复制下面的真实 teammate ID。不要使用序号、占位符、角色别名或自己猜测的名称。')
    for (const teammate of input.teammates) {
      parts.push(`- **${teammate.name}** (ID: ${teammate.id}) | 角色: ${teammate.role} | 状态: ${teammate.status} | 能力: ${teammate.capabilities || '通用'}`)
    }
  } else {
    parts.push('## 当前团队')
    parts.push('暂无团队成员（仅你自己）。如果需要执行任务，请先创建队友。')
  }

  if (input.tasks.length > 0) {
    parts.push('\n## 当前任务列表')
    for (const task of input.tasks) {
      const assignee = task.assignee ? `→ ${task.assignee.name}` : '未分配'
      const description = task.description || ''
      const resultSummary = task.resultSummary ? ` | 结果摘要: ${task.resultSummary}` : ''
      const errorSummary = task.errorSummary ? ` | 错误: ${task.errorSummary}` : ''
      parts.push(`- [${task.status}] **${task.title}** (ID: ${task.id}) ${assignee} | ${description}${resultSummary}${errorSummary}`)
    }

    const interruptedTasks = input.tasks.filter(task => task.errorSummary?.includes('服务器重启'))
    if (interruptedTasks.length > 0) {
      parts.push('\n## 中断恢复通知')
      parts.push(`以下 ${interruptedTasks.length} 个任务因服务器重启被中断，已重置为待分配状态：`)
      for (const task of interruptedTasks) {
        parts.push(`- **${task.title}** (ID: ${task.id})`)
      }
      parts.push('请重新分配这些任务给合适的队友。')
    }
  }

  if (input.attachments.length > 0) {
    parts.push('\n## 会话文件')
    for (const attachment of input.attachments) {
      const sizeText = typeof attachment.size === 'number' ? ` | ${attachment.size} bytes` : ''
      parts.push(`- ${attachment.fileName} (ID: ${attachment.fileId}) | ${attachment.mimeType}${sizeText}`)
    }
  }

  return parts.length > 0 ? `[系统状态更新]\n${parts.join('\n')}` : null
}

export function buildLeadContextMessages(input: {
  teammates: LeadTeammateRecord[]
  tasks: LeadTaskRecord[]
  attachments: LeadAttachmentRecord[]
  contextEntries: ContextEntryRecord[]
  externalMessages: ExternalMessageRecord[]
  selfTodos?: LeadSelfTodoRecord[]
  currentUserMessage?: string
  currentAttachments?: Array<{ fileName: string; mimeType: string }>
}): LLMMessage[] {
  const messages: LLMMessage[] = []

  const stateMessage = buildLeadSystemStateMessage({
    teammates: input.teammates,
    tasks: input.tasks,
    attachments: input.attachments,
    selfTodos: input.selfTodos,
  })
  if (stateMessage) {
    pushMessage(messages, 'user', stateMessage)
    pushMessage(messages, 'assistant', '好的，我已了解当前团队、任务和会话文件状态。')
  }

  for (const message of input.externalMessages) {
    pushMessage(messages, message.senderType === 'user' ? 'user' : 'assistant', message.content)
  }

  appendToolAwareEntries(messages, [...input.contextEntries].reverse())

  let currentMessage = input.currentUserMessage?.trim() || ''
  if (currentMessage) {
    if (input.currentAttachments && input.currentAttachments.length > 0) {
      currentMessage += '\n\n[附件]: ' + input.currentAttachments.map(item => `${item.fileName} (${item.mimeType})`).join(', ')
    }
    pushMessage(messages, 'user', currentMessage)
  }

  const liveTodoBoard = renderLeadSelfTodoBoard(input.selfTodos)
  if (liveTodoBoard) {
    pushMessage(messages, 'user', `[回合末尾实时校验]\n${liveTodoBoard}`)
  }

  return messages.length > 0 ? compressContextMessages(messages) : [{ role: 'user', content: '你好' }]
}

export function buildLeadContextSummary(input: {
  externalMessages: ExternalMessageRecord[]
  teammates: LeadTeammateRecord[]
  tasks: LeadTaskRecord[]
  attachments: LeadAttachmentRecord[]
  selfTodos?: LeadSelfTodoRecord[]
}): string {
  const parts: string[] = []

  if (input.externalMessages.length > 0) {
    parts.push('## 最近对话')
    parts.push('优先满足最近一次用户明确提出、且尚未产出的交付物。若用户追加了“讲义/教案/汇总稿/总结版”等新成果，不能把先前的分析报告误当作该交付物已经完成。')
    for (const message of input.externalMessages) {
      const speaker = message.senderType === 'user' ? '用户' : 'Lead'
      parts.push(`- ${speaker}: ${message.content.slice(0, 300)}`)
    }
  }

  const stateMessage = buildLeadSystemStateMessage({
    teammates: input.teammates,
    tasks: input.tasks,
    attachments: input.attachments,
    selfTodos: input.selfTodos,
  })
  if (stateMessage) {
    parts.push(stateMessage)
  }

  return parts.join('\n')
}

export function buildTeammateContextMessages(input: {
  contextEntries: ContextEntryRecord[]
  workspaceFileSummary?: string | null
  upstreamFileSummary?: string | null
  newMessagesSummary: string
}): LLMMessage[] {
  const messages: LLMMessage[] = []
  const chronologicalEntries = [...input.contextEntries].reverse()
  const toolCallEntries = new Set(
    chronologicalEntries
      .filter(entry => entry.entryType === 'tool_call')
      .map(entry => getToolUseId(entry))
      .filter((value): value is string => Boolean(value))
  )

  for (const entry of chronologicalEntries) {
    const metadata = parseMetadata(entry.metadata)
    switch (entry.entryType) {
      case 'system_bootstrap':
      case 'team_introduction':
      case 'task_brief':
      case 'task_assignment':
      case 'task_status_change':
      case 'task_retry':
        pushMessage(messages, 'user', `[系统上下文]
${entry.content}`)
        break
      case 'internal_message': {
        const messageType = typeof metadata?.messageType === 'string' ? metadata.messageType : 'internal_message'
        pushMessage(messages, 'user', `[内部消息][${messageType}]
${entry.content}`)
        break
      }
      case 'assistant_response':
        pushMessage(messages, 'assistant', entry.content)
        break
      case 'tool_call':
        if (metadata) appendToolContextMessage(messages, entry, metadata)
        break
      case 'tool_result': {
        const toolUseId = getToolUseId(entry)
        if (metadata && toolUseId && toolCallEntries.has(toolUseId)) {
          appendToolContextMessage(messages, entry, metadata)
        } else {
          const toolName = typeof metadata?.toolName === 'string' ? metadata.toolName : 'unknown_tool'
          const resultContent = typeof metadata?.resultContent === 'string' ? metadata.resultContent : entry.content
          pushMessage(messages, 'user', `[历史工具结果回退]
- 工具: ${toolName}
- 结果: ${resultContent}`)
        }
        break
      }
      case 'error':
        pushMessage(messages, 'user', `[系统错误]
${entry.content}`)
        break
      default:
        break
    }
  }

  if (input.workspaceFileSummary) {
    pushMessage(messages, 'user', input.workspaceFileSummary)
  }

  if (input.upstreamFileSummary) {
    pushMessage(messages, 'user', input.upstreamFileSummary)
  }

  pushMessage(messages, 'user', `## 新消息到达

${input.newMessagesSummary}

请处理这些消息。若附件正文不可读或缺失，请明确报告阻塞，不要基于常识伪造已阅读结果。`)

  return messages.length > 0 ? compressContextMessages(messages) : [{ role: 'user', content: input.newMessagesSummary }]
}
