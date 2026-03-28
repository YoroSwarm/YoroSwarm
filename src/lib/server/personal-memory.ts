/**
 * 个人记忆层 (Personal Memory Layer)
 *
 * 提供 PersonalMemory 和 DreamLog 的 CRUD 操作接口。
 * 与 Auto Memory（文件层）配合工作：auto-memory.ts 负责文件读写，
 * 本模块负责将记忆元数据持久化到数据库。
 */

import prisma from '@/lib/db'

// ============================================
// Types
// ============================================

export type MemoryType = 'PERSONAL' | 'DREAM' | 'EXPERIENCE' | 'FACT' | 'PREFERENCE'
export type MemoryImportance = 1 | 2 | 3 | 4 | 5  // VERY_LOW to CRITICAL

export interface PersonalMemoryItem {
  id?: string
  userId: string
  workspaceId?: string | null
  title: string
  content: string
  memoryType: MemoryType
  tags?: string[]
  importance?: MemoryImportance
  relatedEntityType?: string | null
  relatedEntityId?: string | null
}

export interface DreamLogItem {
  id?: string
  userId: string
  memoryId: string
  title: string
  content: string
  mood?: string | null
  emotion?: string | null
  dreamSymbols?: string[]
  interpretation?: string | null
  relatedEntityType?: string | null
  relatedEntityId?: string | null
}

export interface PersonalMemoryRow {
  id: string
  userId: string
  workspaceId: string | null
  title: string
  content: string
  memoryType: MemoryType
  tags: string[]
  importance: number
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DreamLogRow {
  id: string
  userId: string
  memoryId: string
  title: string
  content: string
  mood: string | null
  emotion: string | null
  dreamSymbols: string[]
  interpretation: string | null
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Mappers
// ============================================

function mapMemoryRow(row: {
  id: string
  userId: string
  workspaceId: string | null
  title: string
  content: string
  memoryType: string
  tags: string | null
  importance: number
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}): PersonalMemoryRow {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    title: row.title,
    content: row.content,
    memoryType: row.memoryType as MemoryType,
    tags: row.tags ? JSON.parse(row.tags) : [],
    importance: row.importance,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapDreamLogRow(row: {
  id: string
  userId: string
  memoryId: string
  title: string
  content: string
  mood: string | null
  emotion: string | null
  dreamSymbols: string | null
  interpretation: string | null
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}): DreamLogRow {
  return {
    id: row.id,
    userId: row.userId,
    memoryId: row.memoryId,
    title: row.title,
    content: row.content,
    mood: row.mood,
    emotion: row.emotion,
    dreamSymbols: row.dreamSymbols ? JSON.parse(row.dreamSymbols) : [],
    interpretation: row.interpretation,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ============================================
// PersonalMemory CRUD
// ============================================

/**
 * 创建个人记忆
 */
export async function createPersonalMemory(input: PersonalMemoryItem): Promise<PersonalMemoryRow> {
  const row = await prisma.personalMemory.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      title: input.title,
      content: input.content,
      memoryType: input.memoryType,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      importance: input.importance ?? 1,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    },
  })
  return mapMemoryRow(row)
}

/**
 * 批量创建个人记忆
 */
export async function createPersonalMemories(inputs: PersonalMemoryItem[]): Promise<PersonalMemoryRow[]> {
  const rows = await prisma.personalMemory.createMany({
    data: inputs.map(input => ({
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      title: input.title,
      content: input.content,
      memoryType: input.memoryType,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      importance: input.importance ?? 1,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    })),
  })

  const created = await prisma.personalMemory.findMany({
    where: { id: { in: [] } }, // Placeholder — return empty since createMany doesn't return all
    take: 0,
  })

  // Re-fetch by user + timestamps for batch results
  const latestIds = await prisma.personalMemory.findMany({
    where: { userId: inputs[0]?.userId },
    orderBy: { createdAt: 'desc' },
    take: inputs.length,
    select: { id: true },
  })

  return prisma.personalMemory.findMany({
    where: { id: { in: latestIds.map(r => r.id) } },
  }).then(results => results.map(mapMemoryRow))
}

/**
 * 获取用户的个人记忆列表
 */
export async function listPersonalMemories(
  userId: string,
  options: {
    memoryType?: MemoryType
    workspaceId?: string | null
    minImportance?: number
    limit?: number
    offset?: number
  } = {}
): Promise<PersonalMemoryRow[]> {
  const { memoryType, workspaceId, minImportance, limit = 50, offset = 0 } = options

  const rows = await prisma.personalMemory.findMany({
    where: {
      userId,
      ...(memoryType ? { memoryType } : {}),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(minImportance ? { importance: { gte: minImportance } } : {}),
    },
    orderBy: [
      { importance: 'desc' },
      { createdAt: 'desc' },
    ],
    take: limit,
    skip: offset,
  })

  return rows.map(mapMemoryRow)
}

/**
 * 按 workspace 获取个人记忆
 */
export async function getPersonalMemoriesByWorkspace(
  workspaceId: string,
  options: { limit?: number } = {}
): Promise<PersonalMemoryRow[]> {
  const rows = await prisma.personalMemory.findMany({
    where: { workspaceId },
    orderBy: [
      { importance: 'desc' },
      { createdAt: 'desc' },
    ],
    take: options.limit ?? 50,
  })
  return rows.map(mapMemoryRow)
}

/**
 * 获取单条个人记忆
 */
export async function getPersonalMemory(id: string): Promise<PersonalMemoryRow | null> {
  const row = await prisma.personalMemory.findUnique({ where: { id } })
  return row ? mapMemoryRow(row) : null
}

/**
 * 更新个人记忆
 */
export async function updatePersonalMemory(
  id: string,
  input: Partial<Omit<PersonalMemoryItem, 'id' | 'userId'>>
): Promise<PersonalMemoryRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) data.content = input.content
  if (input.memoryType !== undefined) data.memoryType = input.memoryType
  if (input.tags !== undefined) data.tags = input.tags ? JSON.stringify(input.tags) : null
  if (input.importance !== undefined) data.importance = input.importance
  if (input.workspaceId !== undefined) data.workspaceId = input.workspaceId
  if (input.relatedEntityType !== undefined) data.relatedEntityType = input.relatedEntityType
  if (input.relatedEntityId !== undefined) data.relatedEntityId = input.relatedEntityId

  const row = await prisma.personalMemory.update({
    where: { id },
    data,
  })
  return mapMemoryRow(row)
}

/**
 * 删除个人记忆
 */
export async function deletePersonalMemory(id: string): Promise<boolean> {
  try {
    await prisma.personalMemory.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

/**
 * 批量删除个人记忆
 */
export async function deletePersonalMemories(ids: string[]): Promise<number> {
  const result = await prisma.personalMemory.deleteMany({
    where: { id: { in: ids } },
  })
  return result.count
}

/**
 * 搜索个人记忆（按标题或内容关键词）
 */
export async function searchPersonalMemories(
  userId: string,
  query: string,
  options: { memoryType?: MemoryType; limit?: number } = {}
): Promise<PersonalMemoryRow[]> {
  const rows = await prisma.personalMemory.findMany({
    where: {
      userId,
      ...(options.memoryType ? { memoryType: options.memoryType } : {}),
      OR: [
        { title: { contains: query } },
        { content: { contains: query } },
      ],
    },
    orderBy: { importance: 'desc' },
    take: options.limit ?? 20,
  })
  return rows.map(mapMemoryRow)
}

// ============================================
// DreamLog CRUD
// ============================================

/**
 * 创建梦境日志（关联到一条 PersonalMemory）
 */
export async function createDreamLog(input: DreamLogItem): Promise<DreamLogRow> {
  const row = await prisma.dreamLog.create({
    data: {
      userId: input.userId,
      memoryId: input.memoryId,
      title: input.title,
      content: input.content,
      mood: input.mood ?? null,
      emotion: input.emotion ?? null,
      dreamSymbols: input.dreamSymbols ? JSON.stringify(input.dreamSymbols) : null,
      interpretation: input.interpretation ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    },
  })
  return mapDreamLogRow(row)
}

/**
 * 获取某条记忆关联的梦境日志列表
 */
export async function listDreamLogs(memoryId: string): Promise<DreamLogRow[]> {
  const rows = await prisma.dreamLog.findMany({
    where: { memoryId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapDreamLogRow)
}

/**
 * 获取用户的最新梦境日志
 */
export async function listRecentDreamLogs(
  userId: string,
  options: { limit?: number } = {}
): Promise<DreamLogRow[]> {
  const rows = await prisma.dreamLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 10,
  })
  return rows.map(mapDreamLogRow)
}

/**
 * 获取单条梦境日志
 */
export async function getDreamLog(id: string): Promise<DreamLogRow | null> {
  const row = await prisma.dreamLog.findUnique({ where: { id } })
  return row ? mapDreamLogRow(row) : null
}

/**
 * 更新梦境日志
 */
export async function updateDreamLog(
  id: string,
  input: Partial<Omit<DreamLogItem, 'id' | 'userId' | 'memoryId'>>
): Promise<DreamLogRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) data.content = input.content
  if (input.mood !== undefined) data.mood = input.mood
  if (input.emotion !== undefined) data.emotion = input.emotion
  if (input.dreamSymbols !== undefined) data.dreamSymbols = input.dreamSymbols ? JSON.stringify(input.dreamSymbols) : null
  if (input.interpretation !== undefined) data.interpretation = input.interpretation
  if (input.relatedEntityType !== undefined) data.relatedEntityType = input.relatedEntityType
  if (input.relatedEntityId !== undefined) data.relatedEntityId = input.relatedEntityId

  const row = await prisma.dreamLog.update({
    where: { id },
    data,
  })
  return mapDreamLogRow(row)
}

/**
 * 删除梦境日志
 */
export async function deleteDreamLog(id: string): Promise<boolean> {
  try {
    await prisma.dreamLog.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

// ============================================
// High-level helpers
// ============================================

/**
 * 获取高重要性记忆（用于上下文注入）
 */
export async function getImportantMemories(
  userId: string,
  options: { minImportance?: number; limit?: number } = {}
): Promise<PersonalMemoryRow[]> {
  return listPersonalMemories(userId, {
    minImportance: options.minImportance ?? 4,
    limit: options.limit ?? 10,
  })
}

/**
 * 格式化记忆为可注入上下文的文本
 */
export function formatMemoriesAsContext(memories: PersonalMemoryRow[]): string {
  if (memories.length === 0) return ''

  const lines: string[] = ['## 个人记忆库（Personal Memory）', '']
  for (const mem of memories) {
    lines.push(`### ${mem.title} [${mem.memoryType}]`)
    lines.push(mem.content)
    if (mem.tags.length > 0) {
      lines.push(`Tags: ${mem.tags.join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================
// Tool executor helper
// ============================================

// 工具调用参数类型（对应 remember_to_memory 工具的输入）
export interface SaveMemoryInput {
  swarmSessionId: string
  agentId: string
  content: string
  category: string
  importance: string
  tags: string[]
  sourceRef?: string
  context?: string
}

// 工具调用返回类型
export interface SaveMemoryResult {
  id: string
  title: string
  content: string
  memoryType: string
  importance: number
  tags: string[]
  createdAt: Date
}

/**
 * 工具调用专用：保存记忆到数据库
 * 从 agentId 反查 userId，并将 category 映射到 memoryType
 */
export async function saveMemory(input: SaveMemoryInput): Promise<SaveMemoryResult> {
  // 通过 agent -> session -> user 获取 userId
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    include: {
      swarmSession: {
        select: { userId: true, workspaceId: true },
      },
    },
  })

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`)
  }

  const userId = agent.swarmSession.userId
  const workspaceId = agent.swarmSession.workspaceId

  // 将 category 映射到 memoryType
  const categoryToMemoryType: Record<string, MemoryType> = {
    user_preference: 'PREFERENCE',
    decision: 'EXPERIENCE',
    discovery: 'FACT',
    pattern: 'EXPERIENCE',
    fact: 'FACT',
    context: 'PERSONAL',
    other: 'PERSONAL',
  }
  const memoryType = categoryToMemoryType[input.category] ?? 'PERSONAL'

  // importance 字符串映射到数字
  const importanceMap: Record<string, MemoryImportance> = {
    high: 5,
    medium: 3,
    low: 1,
  }
  const importance = importanceMap[input.importance] ?? 3

  // 生成标题：从内容前 80 字符提取
  const title = input.content.slice(0, 80) + (input.content.length > 80 ? '…' : '')

  const row = await createPersonalMemory({
    userId,
    workspaceId: workspaceId ?? undefined,
    title,
    content: input.content,
    memoryType,
    tags: input.tags,
    importance,
    relatedEntityType: 'swarm_session',
    relatedEntityId: input.swarmSessionId,
  })

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    memoryType: row.memoryType,
    importance: row.importance,
    tags: row.tags,
    createdAt: row.createdAt,
  }
}
