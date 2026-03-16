/**
 * 两级上下文压缩策略
 * 
 * Level 1: Micro-compact（工具结果层压缩）
 *   - 保留最近 N 个完整 tool_use+tool_result 对
 *   - 旧的 tool_result 替换为 [Previous: used {tool_name}] 占位符
 * 
 * Level 2: Auto-compact（对话摘要层压缩）
 *   - 存档完整对话到 .transcripts/
 *   - 调用 LLM 生成结构化总结
 *   - 用摘要 + 最近几轮替换完整历史
 */

import type { LLMMessage, ContentBlock, ToolUseBlock, ToolResultBlock } from './llm/types'
import { getModelContextSize } from './llm/config'
import { callLLM } from './llm/client'
import { ensureSessionWorkspaceRoot } from './session-workspace'
import { mkdir, writeFile, readFile } from 'fs/promises'
import path from 'path'

// ============================================
// Token 估算
// ============================================

const CHARS_PER_TOKEN = 3.5

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

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

// ============================================
// 工具块类型检查
// ============================================

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use'
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result'
}

function hasToolBlock(content: string | ContentBlock[]): boolean {
  return Array.isArray(content) && content.some(block => block.type === 'tool_use' || block.type === 'tool_result')
}

// ============================================
// Level 1: Micro-compact（工具结果层压缩）
// ============================================

interface ToolPairLocation {
  // tool_use 所在的消息索引和块索引
  useMessageIdx: number
  useBlockIdx: number
  toolName: string
  toolUseId: string
  // tool_result 所在的消息索引和块索引
  resultMessageIdx: number
  resultBlockIdx: number
}

/**
 * 找到所有 tool_use/tool_result 配对及其位置
 */
function findToolPairs(messages: LLMMessage[]): ToolPairLocation[] {
  const pairs: ToolPairLocation[] = []
  const toolUseMap = new Map<string, { messageIdx: number; blockIdx: number; toolName: string }>()

  // 第一遍：收集所有 tool_use 的位置
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (typeof msg.content === 'string') continue
    for (let j = 0; j < msg.content.length; j++) {
      const block = msg.content[j]
      if (isToolUseBlock(block)) {
        toolUseMap.set(block.id, { messageIdx: i, blockIdx: j, toolName: block.name })
      }
    }
  }

  // 第二遍：配对 tool_result
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (typeof msg.content === 'string') continue
    for (let j = 0; j < msg.content.length; j++) {
      const block = msg.content[j]
      if (isToolResultBlock(block)) {
        const useInfo = toolUseMap.get(block.tool_use_id)
        if (useInfo) {
          pairs.push({
            useMessageIdx: useInfo.messageIdx,
            useBlockIdx: useInfo.blockIdx,
            toolName: useInfo.toolName,
            toolUseId: block.tool_use_id,
            resultMessageIdx: i,
            resultBlockIdx: j,
          })
        }
      }
    }
  }

  return pairs
}

/**
 * Micro-compact：保留最近 keepRecent 个完整 tool_call+tool_result 对，
 * 将更旧的 tool_result.content 替换为 [Previous: used {tool_name}] 占位符。
 * 始终保持 tool_use/tool_result 结构化配对。
 */
export function microCompactToolResults(
  messages: LLMMessage[],
  keepRecent: number = 3
): LLMMessage[] {
  const pairs = findToolPairs(messages)
  if (pairs.length <= keepRecent) {
    return messages // 不需要压缩
  }

  // 需要压缩的配对（保留最后 keepRecent 个）
  const compactPairs = pairs.slice(0, pairs.length - keepRecent)
  const compactResultIds = new Set(compactPairs.map(p => p.toolUseId))

  // 创建压缩后的 tool_result 内容映射
  const compactMap = new Map<string, string>()
  for (const pair of compactPairs) {
    compactMap.set(pair.toolUseId, `[Previous: used ${pair.toolName}]`)
  }

  // 深拷贝并替换
  return messages.map(msg => {
    if (typeof msg.content === 'string') return msg

    const newBlocks: ContentBlock[] = msg.content.map(block => {
      if (isToolResultBlock(block) && compactResultIds.has(block.tool_use_id)) {
        return {
          ...block,
          content: compactMap.get(block.tool_use_id) || block.content,
        }
      }
      return block
    })

    return { role: msg.role, content: newBlocks }
  })
}

// ============================================
// Level 2: Auto-compact（对话摘要层压缩）
// ============================================

const SUMMARY_SYSTEM_PROMPT = `你是一个对话摘要助手。你的任务是将长对话压缩为结构化总结，保留所有重要信息。

请生成以下格式的 JSON 总结（不要包含代码块标记）：
{
  "accomplished": "已完成的工作描述",
  "currentState": "当前状态描述",
  "keyDecisions": ["关键决策1", "关键决策2"],
  "filesModified": ["file1.md", "file2.ts"],
  "errorsAndFixes": ["错误及修复描述"],
  "pendingTasks": ["待办事项1", "待办事项2"],
  "importantContext": "需要保留的重要上下文信息"
}`

export interface CompactSummary {
  accomplished: string
  currentState: string
  keyDecisions: string[]
  filesModified: string[]
  errorsAndFixes: string[]
  pendingTasks: string[]
  importantContext: string
}

/**
 * 将消息序列存档为 JSONL 格式的转录文件
 */
export async function archiveTranscript(
  messages: LLMMessage[],
  swarmSessionId: string,
  agentId: string
): Promise<string> {
  const root = await ensureSessionWorkspaceRoot(swarmSessionId)
  const transcriptsDir = path.join(root, '.transcripts')
  await mkdir(transcriptsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `transcript_${agentId.slice(0, 8)}_${timestamp}.jsonl`
  const filepath = path.join(transcriptsDir, filename)

  const lines = messages.map(msg => JSON.stringify({
    role: msg.role,
    content: msg.content,
    timestamp: new Date().toISOString(),
  }))

  await writeFile(filepath, lines.join('\n'), 'utf-8')
  return filepath
}

/**
 * 读取转录文件
 */
export async function readTranscript(filepath: string): Promise<LLMMessage[]> {
  const content = await readFile(filepath, 'utf-8')
  return content.split('\n').filter(Boolean).map(line => {
    const parsed = JSON.parse(line)
    return { role: parsed.role, content: parsed.content }
  })
}

/**
 * 调用 LLM 生成结构化摘要
 */
async function generateContextSummary(
  messages: LLMMessage[],
  swarmSessionId: string,
  agentId: string
): Promise<CompactSummary> {
  // 将消息序列转为可读文本供 LLM 摘要
  const conversationText = messages.map(msg => {
    const role = msg.role === 'assistant' ? 'Assistant' : 'User'
    if (typeof msg.content === 'string') {
      return `${role}: ${msg.content.slice(0, 500)}`
    }
    const textParts = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text.slice(0, 300))
    const toolParts = msg.content
      .filter(b => b.type === 'tool_use')
      .map(b => `[Tool: ${(b as ToolUseBlock).name}]`)
    return `${role}: ${[...textParts, ...toolParts].join(' ')}`
  }).join('\n')

  // 截断避免超限
  const truncated = conversationText.slice(0, 8000)

  try {
    const response = await callLLM({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `请总结以下对话：\n\n${truncated}` }],
      maxTokens: 1500,
      temperature: 0.3,
      usageContext: {
        swarmSessionId,
        agentId,
        requestKind: 'context_summary',
      },
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    // 尝试解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as CompactSummary
    }
  } catch (error) {
    console.warn('[ContextCompaction] LLM summary generation failed, using fallback:', error)
  }

  // 回退：生成基本摘要
  return {
    accomplished: '（摘要生成失败，请参考转录文件获取完整历史）',
    currentState: '上下文因超限被压缩',
    keyDecisions: [],
    filesModified: [],
    errorsAndFixes: [],
    pendingTasks: [],
    importantContext: '',
  }
}

/**
 * 将 CompactSummary 格式化为可注入对话的消息文本
 */
function formatSummaryAsMessage(summary: CompactSummary, transcriptPath: string): string {
  const parts: string[] = [
    'This session is being continued from a previous conversation that ran out of context.',
    'The summary below covers the earlier portion of the conversation.',
    `Complete transcript saved to: ${transcriptPath}`,
    '',
    '## Summary of Previous Conversation',
    '',
    `### Accomplished`,
    summary.accomplished,
  ]

  if (summary.keyDecisions.length > 0) {
    parts.push('', '### Key Decisions')
    for (const d of summary.keyDecisions) parts.push(`- ${d}`)
  }

  if (summary.filesModified.length > 0) {
    parts.push('', '### Files Modified')
    for (const f of summary.filesModified) parts.push(`- ${f}`)
  }

  if (summary.errorsAndFixes.length > 0) {
    parts.push('', '### Errors & Fixes')
    for (const e of summary.errorsAndFixes) parts.push(`- ${e}`)
  }

  if (summary.pendingTasks.length > 0) {
    parts.push('', '### Pending Tasks')
    for (const t of summary.pendingTasks) parts.push(`- ${t}`)
  }

  parts.push('', `### Current State`, summary.currentState)

  if (summary.importantContext) {
    parts.push('', '### Important Context', summary.importantContext)
  }

  return parts.join('\n')
}

/**
 * Auto-compact：存档 + 摘要 + 替换
 * 
 * 保留策略：
 * - 系统状态消息（前 2 条）
 * - 最近 keepRecentTurns 轮对话
 * - 压缩中间部分为 LLM 摘要
 */
export async function autoCompact(
  messages: LLMMessage[],
  options: {
    swarmSessionId: string
    agentId: string
    keepRecentTurns?: number
  }
): Promise<LLMMessage[]> {
  const { swarmSessionId, agentId, keepRecentTurns = 6 } = options

  if (messages.length <= keepRecentTurns + 2) {
    return messages // 太少，不压缩
  }

  // 1. 存档完整历史
  const transcriptPath = await archiveTranscript(messages, swarmSessionId, agentId)
  console.log(`[ContextCompaction] Transcript archived to: ${transcriptPath}`)

  // 2. 提取要压缩的部分和要保留的部分
  const earlyMessages = messages.slice(0, 2) // 系统状态
  const recentMessages = messages.slice(-keepRecentTurns)
  const middleMessages = messages.slice(2, -keepRecentTurns)

  // 3. 对中间部分生成 LLM 摘要
  const summary = await generateContextSummary(middleMessages, swarmSessionId, agentId)
  const summaryText = formatSummaryAsMessage(summary, transcriptPath)

  // 4. 构建压缩后的消息序列
  const compactedMessages: LLMMessage[] = [
    ...earlyMessages,
    { role: 'user', content: summaryText },
    { role: 'assistant', content: '好的，我已了解之前的对话内容和当前状态。让我继续处理。' },
    ...recentMessages,
  ]

  const originalTokens = estimateMessagesTokens(messages)
  const compactedTokens = estimateMessagesTokens(compactedMessages)
  console.log(`[ContextCompaction] Auto-compact: ${originalTokens} → ${compactedTokens} tokens (saved ${Math.round((1 - compactedTokens / originalTokens) * 100)}%)`)

  return compactedMessages
}

// ============================================
// 统一压缩入口
// ============================================

export interface CompressOptions {
  maxTokens?: number
  model?: string
  swarmSessionId?: string
  agentId?: string
  microCompactKeepRecent?: number
  autoCompactKeepRecentTurns?: number
}

/**
 * 两级压缩策略入口
 * 
 * 1. 先尝试 Micro-compact（替换旧工具结果为占位符）
 * 2. 如果仍超限，执行 Auto-compact（LLM 摘要 + 转录存档）
 */
export async function compressContext(
  messages: LLMMessage[],
  options: CompressOptions = {}
): Promise<LLMMessage[]> {
  const model = options.model || process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-20250514'
  const maxTokens = options.maxTokens || getModelContextSize(model)
  const microCompactThreshold = 0.6  // 60% 时触发 micro-compact
  const autoCompactThreshold = 0.8   // 80% 时触发 auto-compact
  const keepRecent = options.microCompactKeepRecent ?? 3
  const keepRecentTurns = options.autoCompactKeepRecentTurns ?? 6

  let currentMessages = messages
  let currentTokens = estimateMessagesTokens(currentMessages)

  // Level 1: Micro-compact
  if (currentTokens > maxTokens * microCompactThreshold) {
    currentMessages = microCompactToolResults(currentMessages, keepRecent)
    currentTokens = estimateMessagesTokens(currentMessages)

    if (currentTokens <= maxTokens * autoCompactThreshold) {
      return currentMessages
    }
  }

  // Level 2: Auto-compact（需要 session/agent 信息）
  if (currentTokens > maxTokens * autoCompactThreshold && options.swarmSessionId && options.agentId) {
    currentMessages = await autoCompact(currentMessages, {
      swarmSessionId: options.swarmSessionId,
      agentId: options.agentId,
      keepRecentTurns,
    })
  }

  return currentMessages
}

// ============================================
// 工具配对完整性保护
// ============================================

/**
 * 确保 context entries 中 tool_call/tool_result 配对完整。
 * 如果一方因截断丢失，将另一方也移除（而非降级为文本）。
 */
export function ensureToolPairIntegrity(
  entries: Array<{ entryType: string; content: string; metadata: string | null }>
): Array<{ entryType: string; content: string; metadata: string | null }> {
  // 收集所有 tool_call 的 toolUseId
  const toolCallIds = new Set<string>()
  // 收集所有 tool_result 的 toolUseId
  const toolResultIds = new Set<string>()

  for (const entry of entries) {
    const toolUseId = extractToolUseId(entry.metadata)
    if (!toolUseId) continue

    if (entry.entryType === 'tool_call') {
      toolCallIds.add(toolUseId)
    } else if (entry.entryType === 'tool_result') {
      toolResultIds.add(toolUseId)
    }
  }

  // 完整配对 = 同时在两个集合中
  const completePairs = new Set<string>()
  for (const id of toolCallIds) {
    if (toolResultIds.has(id)) {
      completePairs.add(id)
    }
  }

  // 过滤：保留非工具条目，以及完整配对的工具条目
  return entries.filter(entry => {
    if (entry.entryType !== 'tool_call' && entry.entryType !== 'tool_result') {
      return true // 非工具条目保留
    }

    const toolUseId = extractToolUseId(entry.metadata)
    if (!toolUseId) return false // 无 ID 的工具条目丢弃

    return completePairs.has(toolUseId)
  })
}

function extractToolUseId(metadata: string | null): string | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    return typeof parsed?.toolUseId === 'string' ? parsed.toolUseId : null
  } catch {
    return null
  }
}
