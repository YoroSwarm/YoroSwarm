/**
 * Auto-Dream 整合引擎
 *
 * 职责：
 * 1. 监听会话空闲状态，触发"梦境生成"
 * 2. 整合记忆碎片（从 personal-memory 和 auto-memory）生成 DreamLog
 * 3. 在下一会话开始时注入 DreamLog 作为"回忆"上下文
 *
 * 设计原则：
 * - 异步非阻塞：梦境生成不影响主会话响应
 * - 按需触发：仅在会话空闲足够长时间后才生成
 * - 渐进增强：如果 personal-memory 模块未就绪，降级到 SharedKnowledgeEntry
 */

import prisma from '@/lib/db'
import {
  listRecentDreamLogs,
  createDreamLog,
  getImportantMemories,
} from './personal-memory'
import { MEMORY_CONFIG } from '@/lib/constants/memory'

// ============================================
// Types
// ============================================

export interface DreamContext {
  userId: string
  swarmSessionId: string
  recentMemories: Array<{
    content: string
    memoryType: string
    tags: string[]
  }>
  recentDreamLogs?: Array<{
    title: string
    content: string
    mood?: string
  }>
  sessionActivity?: {
    taskCount: number
    completedTaskCount: number
    teammateCount: number
  }
}

export interface DreamGenerationResult {
  success: boolean
  dreamId?: string
  mood?: string
  emotion?: string
  title?: string
  skipped: boolean
  reason?: string
}

// ============================================
// Dream 触发条件
// ============================================

const DREAM_TRIGGER_CONFIG = {
  // 会话空闲多久后触发（毫秒），默认 30 分钟
  idleThresholdMs: 30 * 60 * 1000,
  // 最大生成间隔（毫秒），默认 24 小时
  maxIntervalMs: 24 * 60 * 60 * 1000,
  // 最少记忆数量才生成梦境
  minMemories: 2,
  // 最大记忆数量用于生成
  maxMemories: 10,
} as const

// ============================================
// 核心函数
// ============================================

/**
 * 检查是否可以生成梦境
 */
export async function shouldTriggerDream(userId: string): Promise<{
  shouldTrigger: boolean
  reason: string
}> {
  // 检查上次生成时间
  const recentDreams = await listRecentDreamLogs(userId, { limit: 1 })
  if (recentDreams.length > 0) {
    const lastDream = recentDreams[0]
    const elapsed = Date.now() - lastDream.createdAt.getTime()
    if (elapsed < DREAM_TRIGGER_CONFIG.maxIntervalMs) {
      return {
        shouldTrigger: false,
        reason: `上次梦境生成于 ${Math.round(elapsed / 60000)} 分钟前，未达到最小间隔`,
      }
    }
  }

  // 检查是否有足够的记忆碎片
  const memories = await getImportantMemories(userId, {
    minImportance: 3,
    limit: DREAM_TRIGGER_CONFIG.maxMemories,
  })
  if (memories.length < DREAM_TRIGGER_CONFIG.minMemories) {
    return {
      shouldTrigger: false,
      reason: `记忆数量不足（${memories.length}/${DREAM_TRIGGER_CONFIG.minMemories}）`,
    }
  }

  return { shouldTrigger: true, reason: '满足所有触发条件' }
}

/**
 * 构建梦境生成的上下文
 */
export async function buildDreamContext(
  userId: string,
  swarmSessionId: string
): Promise<DreamContext | null> {
  const [memories, recentDreams] = await Promise.all([
    getImportantMemories(userId, {
      minImportance: 3,
      limit: DREAM_TRIGGER_CONFIG.maxMemories,
    }),
    listRecentDreamLogs(userId, { limit: 3 }),
  ])

  if (memories.length === 0) {
    return null
  }

  // 统计会话活跃度
  const [taskStats, teammateCount] = await Promise.all([
    prisma.teamLeadTask.count({
      where: {
        swarmSession: { userId },
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 最近7天
        },
      },
    }),
    prisma.agent.count({
      where: { swarmSession: { userId } },
    }),
  ])

  return {
    userId,
    swarmSessionId,
    recentMemories: memories.map(m => ({
      content: m.content,
      memoryType: m.memoryType,
      tags: m.tags,
    })),
    recentDreamLogs: recentDreams.map(d => ({
      title: d.title,
      content: d.content,
      mood: d.mood ?? undefined,
    })),
    sessionActivity: {
      taskCount: taskStats,
      completedTaskCount: taskStats,
      teammateCount,
    },
  }
}

/**
 * 生成梦境内容（使用 LLM）
 */
export async function generateDreamContent(
  context: DreamContext
): Promise<{
  title: string
  content: string
  mood: string
  emotion: string
  dreamSymbols: string[]
} | null> {
  try {
    const { callLLM, extractTextContent } = await import('./llm/client')

    const memorySummary = context.recentMemories
      .slice(0, 5)
      .map((m, i) => `${i + 1}. [${m.memoryType}] ${m.content.slice(0, 200)}`)
      .join('\n')

    const recentDreamSummary = context.recentDreamLogs
      ?.map(d => `- ${d.title}: ${d.content.slice(0, 100)}`)
      .join('\n') || '（无）'

    const prompt = `你是一位富有想象力的叙事者，正在将零散的记忆碎片编织成一段神秘的梦境。

## 记忆碎片
${memorySummary}

## 最近梦境
${recentDreamSummary}

## 任务统计
- 近7天完成任务: ${context.sessionActivity?.completedTaskCount ?? 0}
- 团队规模: ${context.sessionActivity?.teammateCount ?? 1}

## 任务
请基于以上记忆碎片，创作一段 200-400 字的梦境叙事。

要求：
1. 以意识流风格呈现，想法自然流淌
2. 记忆碎片应当以象征、隐喻的方式出现，而非直接复述
3. 选择一个最匹配的 mood 和 emotion
4. 提取 2-5 个梦的象征符号（dream symbols）
5. 不要添加任何解释、说明或格式前缀，直接输出梦境内容

请严格按以下 JSON 格式输出（不要添加任何额外文字）：
{
  "title": "简短梦境标题（5-15字）",
  "content": "梦境叙事正文（200-400字）",
  "mood": "${MEMORY_CONFIG.dream.moods.join('|')}",
  "emotion": "${MEMORY_CONFIG.dream.emotions.join('|')}",
  "dreamSymbols": ["符号1", "符号2", "符号3"]
}`

    const response = await callLLM({
      systemPrompt: '你是一个 JSON 生成的助手。请严格按照指定格式输出 JSON，不要有任何额外内容。',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      usageContext: {
        swarmSessionId: context.swarmSessionId,
        requestKind: 'dream_generation',
      },
    })

    const text = extractTextContent(response)
    if (!text) return null

    // 尝试解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        title?: string
        content?: string
        mood?: string
        emotion?: string
        dreamSymbols?: string[]
      }

      if (!parsed.title || !parsed.content) return null

      return {
        title: String(parsed.title).slice(0, 50),
        content: String(parsed.content).slice(0, 2000),
        mood: MEMORY_CONFIG.dream.moods.includes(parsed.mood as never)
          ? String(parsed.mood)
          : 'neutral',
        emotion: MEMORY_CONFIG.dream.emotions.includes(parsed.emotion as never)
          ? String(parsed.emotion)
          : 'wonder',
        dreamSymbols: Array.isArray(parsed.dreamSymbols)
          ? parsed.dreamSymbols.slice(0, 5).map(String)
          : [],
      }
    } catch {
      return null
    }
  } catch (error) {
    console.error('[AutoDream] LLM generation failed:', error)
    return null
  }
}

/**
 * 执行完整的梦境生成流程
 */
export async function runDreamGeneration(
  userId: string,
  swarmSessionId: string
): Promise<DreamGenerationResult> {
  // 1. 检查触发条件
  const triggerCheck = await shouldTriggerDream(userId)
  if (!triggerCheck.shouldTrigger) {
    return { success: false, skipped: true, reason: triggerCheck.reason }
  }

  // 2. 构建上下文
  const context = await buildDreamContext(userId, swarmSessionId)
  if (!context) {
    return { success: false, skipped: true, reason: '无法构建梦境上下文' }
  }

  // 3. 生成梦境内容
  const dreamContent = await generateDreamContent(context)
  if (!dreamContent) {
    return { success: false, skipped: true, reason: '梦境内容生成失败' }
  }

  // 4. 创建 PersonalMemory（梦境类型）
  const { createPersonalMemory } = await import('./personal-memory')
  const memoryRow = await createPersonalMemory({
    userId,
    workspaceId: null,
    title: dreamContent.title,
    content: dreamContent.content,
    memoryType: 'DREAM',
    tags: ['auto-dream', 'generated', ...dreamContent.dreamSymbols.slice(0, 3)],
    importance: 2,
    relatedEntityType: 'swarm_session',
    relatedEntityId: swarmSessionId,
  })

  // 5. 创建 DreamLog
  const dreamLog = await createDreamLog({
    userId,
    memoryId: memoryRow.id,
    title: dreamContent.title,
    content: dreamContent.content,
    mood: dreamContent.mood,
    emotion: dreamContent.emotion,
    dreamSymbols: dreamContent.dreamSymbols,
    relatedEntityType: 'swarm_session',
    relatedEntityId: swarmSessionId,
  })

  console.log(`[AutoDream] Dream generated: ${dreamLog.id} - "${dreamContent.title}"`)

  return {
    success: true,
    dreamId: dreamLog.id,
    mood: dreamContent.mood,
    emotion: dreamContent.emotion,
    title: dreamContent.title,
    skipped: false,
  }
}

/**
 * 格式化梦境为可注入上下文的文本
 */
export function formatDreamAsContext(dreams: Array<{
  title: string
  content: string
  mood?: string | null
  emotion?: string | null
  dreamSymbols?: string[]
  createdAt: Date
}>): string {
  if (dreams.length === 0) return ''

  const lines: string[] = ['## 梦境记忆（Dream）', '']

  for (const dream of dreams) {
    lines.push(`### ${dream.title}`)
    if (dream.mood || dream.emotion) {
      const tags = [dream.mood, dream.emotion].filter(Boolean).join(', ')
      lines.push(`*[${tags}]*`)
    }
    lines.push(dream.content)
    if (dream.dreamSymbols && dream.dreamSymbols.length > 0) {
      lines.push(`象征符号: ${dream.dreamSymbols.join(' · ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
