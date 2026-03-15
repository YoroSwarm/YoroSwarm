/**
 * 共享知识层 (Shared Knowledge Layer)
 * 
 * 参考 Kimi Agent Swarm 的"共享上下文窗口"设计：
 * 1. 任务完成时自动写入知识库
 * 2. Teammate 启动时按任务依赖关系拉取相关知识片段（Context Slicing）
 * 3. 避免传递全部知识，防止上下文膨胀
 */

import prisma from '@/lib/db'

export interface SharedKnowledgeInput {
  swarmSessionId: string
  taskId?: string
  agentId: string
  entryType: 'task_result' | 'discovery' | 'resource' | 'fact'
  title: string
  content: string
  summary?: string
  tags?: string[]
  confidence?: number
}

/**
 * 写入共享知识
 */
export async function writeSharedKnowledge(input: SharedKnowledgeInput) {
  return prisma.sharedKnowledgeEntry.create({
    data: {
      swarmSessionId: input.swarmSessionId,
      taskId: input.taskId || null,
      agentId: input.agentId,
      entryType: input.entryType,
      title: input.title,
      content: input.content,
      summary: input.summary || null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      confidence: input.confidence ?? 1.0,
    },
  })
}

/**
 * 按任务依赖关系拉取上游知识片段（Context Slicing）
 * 只返回当前任务直接依赖的任务产出的知识
 */
export async function getUpstreamKnowledge(
  swarmSessionId: string,
  taskId: string,
  options: { maxEntries?: number; summaryOnly?: boolean } = {}
): Promise<Array<{
  id: string
  taskId: string | null
  entryType: string
  title: string
  content: string
  summary: string | null
  tags: string[]
  confidence: number
}>> {
  const { maxEntries = 20, summaryOnly = false } = options

  // 获取当前任务的所有直接依赖
  const dependencies = await prisma.taskDependency.findMany({
    where: { taskId },
    select: { dependsOnTaskId: true },
  })

  const upstreamTaskIds = dependencies.map(d => d.dependsOnTaskId)

  if (upstreamTaskIds.length === 0) {
    return []
  }

  const entries = await prisma.sharedKnowledgeEntry.findMany({
    where: {
      swarmSessionId,
      taskId: { in: upstreamTaskIds },
    },
    orderBy: [
      { confidence: 'desc' },
      { createdAt: 'desc' },
    ],
    take: maxEntries,
  })

  return entries.map(entry => ({
    id: entry.id,
    taskId: entry.taskId,
    entryType: entry.entryType,
    title: entry.title,
    content: summaryOnly && entry.summary ? entry.summary : entry.content,
    summary: entry.summary,
    tags: entry.tags ? JSON.parse(entry.tags) : [],
    confidence: entry.confidence,
  }))
}

/**
 * 获取全局知识（用于 Lead 聚合结果时）
 */
export async function getSessionKnowledge(
  swarmSessionId: string,
  options: {
    entryType?: string
    maxEntries?: number
    taskIds?: string[]
  } = {}
): Promise<Array<{
  id: string
  taskId: string | null
  agentId: string
  entryType: string
  title: string
  content: string
  summary: string | null
  tags: string[]
  confidence: number
}>> {
  const { maxEntries = 50 } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    swarmSessionId,
  }
  if (options.entryType) where.entryType = options.entryType
  if (options.taskIds?.length) where.taskId = { in: options.taskIds }

  const entries = await prisma.sharedKnowledgeEntry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: maxEntries,
  })

  return entries.map(entry => ({
    id: entry.id,
    taskId: entry.taskId,
    agentId: entry.agentId,
    entryType: entry.entryType,
    title: entry.title,
    content: entry.content,
    summary: entry.summary,
    tags: entry.tags ? JSON.parse(entry.tags) : [],
    confidence: entry.confidence,
  }))
}

/**
 * 任务完成时自动将结果写入共享知识库
 */
export async function publishTaskResult(input: {
  swarmSessionId: string
  taskId: string
  agentId: string
  taskTitle: string
  report: string
  resultSummary?: string
}) {
  return writeSharedKnowledge({
    swarmSessionId: input.swarmSessionId,
    taskId: input.taskId,
    agentId: input.agentId,
    entryType: 'task_result',
    title: input.taskTitle,
    content: input.report,
    summary: input.resultSummary,
    tags: ['task_output'],
  })
}

/**
 * 格式化上游知识为上下文文本
 */
export function formatUpstreamKnowledge(
  entries: Array<{ title: string; content: string; entryType: string }>
): string | null {
  if (entries.length === 0) return null

  const lines = ['## 前置任务产出（共享知识库）', '以下是你的前置任务已完成的成果，可以直接引用：', '']

  for (const entry of entries) {
    lines.push(`### ${entry.title}`)
    lines.push(entry.content.slice(0, 2000))
    lines.push('')
  }

  return lines.join('\n')
}
