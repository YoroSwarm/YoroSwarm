import { randomUUID } from 'crypto'

import type { Prisma } from '@prisma/client'

import prisma from '@/lib/db'

export type LeadSelfTodoStatus = 'pending' | 'in_progress' | 'completed' | 'dropped'
export type LeadSelfTodoCategory = 'user_request' | 'deliverable' | 'coordination' | 'verification' | 'other'

export type LeadSelfTodoItem = {
  id: string
  title: string
  details?: string
  status: LeadSelfTodoStatus
  category: LeadSelfTodoCategory
  sourceRef?: string
  updatedAt: string
}

const MAX_LEAD_SELF_TODOS = 20

type LeadSelfTodoTx = Prisma.TransactionClient

type LeadSelfTodoRow = Awaited<ReturnType<LeadSelfTodoTx['leadSelfTodo']['findMany']>>[number]

/**
 * 生成语义化 ID：基于标题的 slug 形式
 * 格式: {slug}-{短ID}
 * 例如: "todo-research-ai-a1b2"
 */
function generateSemanticId(title: string): string {
  // 1. 英文/数字保留，中文按字数计算（每个汉字计为2个字符）
  let charCount = 0
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')  // 移除非法字符
    .trim()
    .replace(/\s+/g, '-')  // 空格转为短横线

  // 计算有效字符数（汉字计2，英文数字计1）
  for (const char of slug) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      charCount += 2
    } else {
      charCount += 1
    }
  }

  // 2. 截取到合理长度
  let result = ''
  charCount = 0
  for (const char of slug) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      if (charCount + 2 > 15) break
      result += char
      charCount += 2
    } else {
      if (charCount + 1 > 15) break
      result += char
      charCount += 1
    }
  }

  // 3. 拼接 UUID 前4位确保唯一性
  const shortId = randomUUID().slice(0, 4)

  return `${result || 'todo'}-${shortId}`
}

function isLegacyAutoCapturedTodo(input: {
  title: string
  category: string
  sourceRef?: string | null
}): boolean {
  const sourceRef = input.sourceRef || ''
  const title = input.title.trim()

  if (input.category !== 'user_request') return false
  if (!sourceRef.startsWith('external:') && !sourceRef.startsWith('inbox-user:')) return false

  return title === '处理用户最新请求' || title.startsWith('处理用户请求: ')
}

function normalizeText(value: string | undefined | null): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}


function sanitizeItem(item: LeadSelfTodoItem): LeadSelfTodoItem | null {
  const now = new Date().toISOString()
  const rawId = normalizeText(item.id)
  const rawTitle = normalizeText(item.title)

  // 如果没有提供 id，基于标题生成语义化 ID
  if (!rawId && rawTitle) {
    const generatedId = generateSemanticId(rawTitle)
    const normalized: LeadSelfTodoItem = {
      id: generatedId,
      title: rawTitle,
      details: normalizeText(item.details) || undefined,
      status: item.status,
      category: item.category,
      sourceRef: normalizeText(item.sourceRef) || undefined,
      updatedAt: item.updatedAt || now,
    }
    return normalized.title ? normalized : null
  }

  const normalized: LeadSelfTodoItem = {
    id: rawId || randomUUID(),
    title: rawTitle,
    details: normalizeText(item.details) || undefined,
    status: item.status,
    category: item.category,
    sourceRef: normalizeText(item.sourceRef) || undefined,
    updatedAt: item.updatedAt || now,
  }

  return normalized.title ? normalized : null
}

function sanitizeItems(items: LeadSelfTodoItem[]): LeadSelfTodoItem[] {
  return items
    .map(item => sanitizeItem(item))
    .filter((item): item is LeadSelfTodoItem => Boolean(item))
}

function normalizeComparableItems(items: LeadSelfTodoItem[]): Array<{
  id: string
  title: string
  details?: string
  status: LeadSelfTodoStatus
  category: LeadSelfTodoCategory
  sourceRef?: string
}> {
  return sanitizeItems(items).map(item => ({
    id: item.id,
    title: item.title,
    details: item.details,
    status: item.status,
    category: item.category,
    sourceRef: item.sourceRef,
  }))
}

function mapRowToTodoItem(row: LeadSelfTodoRow): LeadSelfTodoItem {
  return {
    id: row.id,
    title: row.title,
    details: row.details || undefined,
    status: row.status as LeadSelfTodoStatus,
    category: row.category as LeadSelfTodoCategory,
    sourceRef: row.sourceRef || undefined,
    updatedAt: row.updatedAt.toISOString(),
  }
}


async function listLeadSelfTodoRows(tx: LeadSelfTodoTx, leadAgentId: string): Promise<LeadSelfTodoRow[]> {
  const rows = await tx.leadSelfTodo.findMany({
    where: { leadAgentId },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  const legacyRows = rows.filter(row => isLegacyAutoCapturedTodo({
    title: row.title,
    category: row.category,
    sourceRef: row.sourceRef,
  }))

  if (legacyRows.length > 0) {
    await tx.leadSelfTodo.deleteMany({
      where: {
        id: { in: legacyRows.map(row => row.id) },
        leadAgentId,
      },
    })
    return rows.filter(row => !legacyRows.some(legacy => legacy.id === row.id))
  }

  return rows
}

async function listLeadSelfTodoItemsInTx(tx: LeadSelfTodoTx, leadAgentId: string): Promise<LeadSelfTodoItem[]> {
  const rows = await listLeadSelfTodoRows(tx, leadAgentId)
  return rows.map(mapRowToTodoItem)
}

async function reindexLeadSelfTodoRows(tx: LeadSelfTodoTx, rows: LeadSelfTodoRow[]) {
  for (const [index, row] of rows.entries()) {
    if (row.sortOrder !== index) {
      await tx.leadSelfTodo.update({
        where: { id: row.id },
        data: { sortOrder: index },
      })
    }
  }
}

function buildTodoBaseData(input: {
  swarmSessionId: string
  leadAgentId: string
  item: LeadSelfTodoItem
  sortOrder: number
}) {
  return {
    swarmSessionId: input.swarmSessionId,
    leadAgentId: input.leadAgentId,
    title: input.item.title,
    details: input.item.details || null,
    status: input.item.status,
    category: input.item.category,
    sourceRef: input.item.sourceRef || null,
    sortOrder: input.sortOrder,
    completedAt: input.item.status === 'completed' ? new Date() : null,
  }
}

async function insertLeadSelfTodoItemInternal(input: {
  tx: LeadSelfTodoTx
  swarmSessionId: string
  leadAgentId: string
  item: LeadSelfTodoItem
  index?: number
  preserveExistingPosition?: boolean
}): Promise<LeadSelfTodoItem[]> {
  const sanitized = sanitizeItem(input.item)
  if (!sanitized) {
    return listLeadSelfTodoItemsInTx(input.tx, input.leadAgentId)
  }

  const existingRows = await listLeadSelfTodoRows(input.tx, input.leadAgentId)
  const existingIndex = existingRows.findIndex(row => row.id === sanitized.id)
  const remainingRows = existingRows.filter(row => row.id !== sanitized.id)
  const fallbackIndex = input.index ?? remainingRows.length
  const targetIndex = input.preserveExistingPosition && existingIndex >= 0
    ? existingIndex
    : Math.max(0, Math.min(remainingRows.length, fallbackIndex))

  const orderedIds = remainingRows.map(row => row.id)
  orderedIds.splice(targetIndex, 0, sanitized.id)

  const keptIds = orderedIds.slice(0, MAX_LEAD_SELF_TODOS)
  const keptIdSet = new Set(keptIds)
  const removedIds = existingRows
    .map(row => row.id)
    .filter(id => !keptIdSet.has(id))

  if (removedIds.length > 0) {
    await input.tx.leadSelfTodo.deleteMany({
      where: {
        id: { in: removedIds },
        leadAgentId: input.leadAgentId,
      },
    })
  }

  for (const [index, id] of keptIds.entries()) {
    if (id === sanitized.id) {
      const baseData = buildTodoBaseData({
        swarmSessionId: input.swarmSessionId,
        leadAgentId: input.leadAgentId,
        item: sanitized,
        sortOrder: index,
      })

      await input.tx.leadSelfTodo.upsert({
        where: { id },
        update: baseData,
        create: {
          id,
          ...baseData,
        },
      })
      continue
    }

    await input.tx.leadSelfTodo.update({
      where: { id },
      data: { sortOrder: index },
    })
  }

  const rows = await listLeadSelfTodoRows(input.tx, input.leadAgentId)
  return rows.map(mapRowToTodoItem)
}

export function areLeadSelfTodoItemsEquivalent(
  left: LeadSelfTodoItem[],
  right: LeadSelfTodoItem[]
): boolean {
  const normalizedLeft = normalizeComparableItems(left)
  const normalizedRight = normalizeComparableItems(right)

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((item, index) => {
    const other = normalizedRight[index]
    return item.id === other.id
      && item.title === other.title
      && item.details === other.details
      && item.status === other.status
      && item.category === other.category
      && item.sourceRef === other.sourceRef
  })
}

export async function getLeadSelfTodoItems(leadAgentId: string): Promise<LeadSelfTodoItem[]> {
  return prisma.$transaction(tx => listLeadSelfTodoItemsInTx(tx, leadAgentId))
}

export async function saveLeadSelfTodoItems(input: {
  swarmSessionId: string
  leadAgentId: string
  items: LeadSelfTodoItem[]
  reason?: string
}) {
  const sanitized = sanitizeItems(input.items).slice(0, MAX_LEAD_SELF_TODOS)

  await prisma.$transaction(async tx => {
    const existing = await listLeadSelfTodoRows(tx, input.leadAgentId)
    const nextIds = new Set(sanitized.map(item => item.id))
    const staleIds = existing.map(item => item.id).filter(id => !nextIds.has(id))

    if (staleIds.length > 0) {
      await tx.leadSelfTodo.deleteMany({
        where: {
          id: { in: staleIds },
          leadAgentId: input.leadAgentId,
        },
      })
    }

    for (const [index, item] of sanitized.entries()) {
      const baseData = buildTodoBaseData({
        swarmSessionId: input.swarmSessionId,
        leadAgentId: input.leadAgentId,
        item,
        sortOrder: index,
      })

      await tx.leadSelfTodo.upsert({
        where: { id: item.id },
        update: baseData,
        create: {
          id: item.id,
          ...baseData,
        },
      })
    }

    const rows = await listLeadSelfTodoRows(tx, input.leadAgentId)
    await reindexLeadSelfTodoRows(tx, rows)
  })

  return getLeadSelfTodoItems(input.leadAgentId)
}

export async function clearLeadSelfTodoItems(input: {
  leadAgentId: string
}) {
  await prisma.leadSelfTodo.deleteMany({
    where: { leadAgentId: input.leadAgentId },
  })

  return [] as LeadSelfTodoItem[]
}

export async function addLeadSelfTodoItem(input: {
  swarmSessionId: string
  leadAgentId: string
  item: LeadSelfTodoItem
}) {
  return prisma.$transaction(tx => insertLeadSelfTodoItemInternal({
    tx,
    swarmSessionId: input.swarmSessionId,
    leadAgentId: input.leadAgentId,
    item: input.item,
  }))
}

export async function insertLeadSelfTodoItem(input: {
  swarmSessionId: string
  leadAgentId: string
  item: LeadSelfTodoItem
  index?: number
}) {
  return prisma.$transaction(tx => insertLeadSelfTodoItemInternal({
    tx,
    swarmSessionId: input.swarmSessionId,
    leadAgentId: input.leadAgentId,
    item: input.item,
    index: input.index,
  }))
}

export async function deleteLeadSelfTodoItem(input: {
  leadAgentId: string
  itemId: string
}) {
  return prisma.$transaction(async tx => {
    const target = await tx.leadSelfTodo.findFirst({
      where: {
        id: input.itemId,
        leadAgentId: input.leadAgentId,
      },
    })

    if (!target) {
      return null
    }

    await tx.leadSelfTodo.delete({ where: { id: target.id } })
    const rows = await listLeadSelfTodoRows(tx, input.leadAgentId)
    await reindexLeadSelfTodoRows(tx, rows)
    return rows.map(mapRowToTodoItem)
  })
}

export async function updateLeadSelfTodoItemStatus(input: {
  leadAgentId: string
  itemId: string
  status: LeadSelfTodoStatus
}) {
  return prisma.$transaction(async tx => {
    const target = await tx.leadSelfTodo.findFirst({
      where: {
        id: input.itemId,
        leadAgentId: input.leadAgentId,
      },
    })

    if (!target) {
      return null
    }

    await tx.leadSelfTodo.update({
      where: { id: target.id },
      data: {
        status: input.status,
        completedAt: input.status === 'completed' ? new Date() : null,
      },
    })

    return listLeadSelfTodoItemsInTx(tx, input.leadAgentId)
  })
}

