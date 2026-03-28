/**
 * Auto Memory 文件操作模块
 *
 * 管理会话工作区中的 .memory/ 目录，提供记忆文件的读写接口。
 * 与 personal-memory.ts（数据库层）配合工作：
 * - auto-memory.ts：负责文件层面的读写、目录管理
 * - personal-memory.ts：负责数据库元数据持久化
 *
 * 目录结构：
 *   .memory/
 *     ├── index.json          # 记忆索引文件
 *     ├── background/         # 背景知识类记忆
 *     │   └── {id}.md
 *     ├── preference/        # 用户偏好类记忆
 *     │   └── {id}.md
 *     ├── skill/             # 技能经验类记忆
 *     │   └── {id}.md
 *     ├── fact/              # 事实性知识记忆
 *     │   └── {id}.md
 *     └── reflection/        # 反思类记忆
 *         └── {id}.md
 */

import path from 'path'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import {
  ensureWorkspaceRoot,
  getWorkspaceRoot,
} from './session-workspace'

// ============================================
// Constants
// ============================================

const MEMORY_DIR_NAME = '.memory'
const INDEX_FILE_NAME = 'index.json'

export const MEMORY_SUBDIRS = [
  'background',
  'preference',
  'skill',
  'fact',
  'reflection',
] as const

export type MemorySubdir = typeof MEMORY_SUBDIRS[number]

// ============================================
// Types
// ============================================

export interface MemoryFileEntry {
  id: string
  title: string
  subdir: MemorySubdir
  relativePath: string
  absolutePath: string
  size: number
  createdAt: string
  updatedAt: string
}

export interface MemoryIndex {
  version: number
  lastUpdated: string
  entries: Array<{
    id: string
    title: string
    subdir: MemorySubdir
    tags?: string[]
    importance?: number
    summary?: string
    createdAt: string
    updatedAt: string
  }>
}

/**
 * 写入记忆文件时的输入
 */
export interface WriteMemoryFileInput {
  id: string
  title: string
  subdir: MemorySubdir
  content: string
  tags?: string[]
  importance?: number
  summary?: string
  swarmSessionId?: string
  workspaceId: string
}

/**
 * 读取记忆文件时的返回
 */
export interface ReadMemoryFileResult {
  entry: MemoryFileEntry
  content: string
  metadata: {
    id: string
    title: string
    subdir: MemorySubdir
    tags: string[]
    importance: number
    summary: string
  }
}

// ============================================
// Directory helpers
// ============================================

function getMemoryRoot(workspaceId: string): string {
  return path.join(getWorkspaceRoot(workspaceId), MEMORY_DIR_NAME)
}

function getSubdirPath(workspaceId: string, subdir: MemorySubdir): string {
  return path.join(getMemoryRoot(workspaceId), subdir)
}

function getIndexPath(workspaceId: string): string {
  return path.join(getMemoryRoot(workspaceId), INDEX_FILE_NAME)
}

function getMemoryFilePath(workspaceId: string, subdir: MemorySubdir, id: string): string {
  return path.join(getMemoryRoot(workspaceId), subdir, `${id}.md`)
}

// ============================================
// Index management
// ============================================

async function readIndex(workspaceId: string): Promise<MemoryIndex | null> {
  const indexPath = getIndexPath(workspaceId)
  if (!existsSync(indexPath)) {
    return null
  }
  try {
    const content = await readFile(indexPath, 'utf-8')
    return JSON.parse(content) as MemoryIndex
  } catch {
    return null
  }
}

async function writeIndex(workspaceId: string, index: MemoryIndex): Promise<void> {
  const indexPath = getIndexPath(workspaceId)
  await mkdir(path.dirname(indexPath), { recursive: true })
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function ensureMemoryDirs(workspaceId: string): Promise<void> {
  const root = getMemoryRoot(workspaceId)
  await mkdir(root, { recursive: true })
  for (const subdir of MEMORY_SUBDIRS) {
    await mkdir(path.join(root, subdir), { recursive: true })
  }
}

// ============================================
// Read operations
// ============================================

/**
 * 获取工作区记忆目录的根路径
 */
export function getMemoryRootPath(workspaceId: string): string {
  return getMemoryRoot(workspaceId)
}

/**
 * 检查记忆目录是否存在
 */
export async function memoryDirExists(workspaceId: string): Promise<boolean> {
  return existsSync(getMemoryRoot(workspaceId))
}

/**
 * 列出所有记忆文件条目（不读取内容）
 */
export async function listMemoryFiles(workspaceId: string): Promise<MemoryFileEntry[]> {
  const root = getMemoryRoot(workspaceId)
  if (!existsSync(root)) {
    return []
  }

  const entries: MemoryFileEntry[] = []

  for (const subdir of MEMORY_SUBDIRS) {
    const subdirPath = getSubdirPath(workspaceId, subdir)
    if (!existsSync(subdirPath)) {
      continue
    }

    const files = await readdir(subdirPath)
    for (const file of files) {
      if (!file.endsWith('.md')) continue

      const id = file.replace(/\.md$/, '')
      const absolutePath = path.join(subdirPath, file)

      try {
        const info = await stat(absolutePath)
        entries.push({
          id,
          title: id, // title will be extracted from content if needed
          subdir,
          relativePath: path.join(MEMORY_DIR_NAME, subdir, file),
          absolutePath,
          size: info.size,
          createdAt: info.birthtime.toISOString(),
          updatedAt: info.mtime.toISOString(),
        })
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Sort by updatedAt descending
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return entries
}

/**
 * 读取指定记忆文件的内容和元数据
 */
export async function readMemoryFile(
  workspaceId: string,
  subdir: MemorySubdir,
  id: string
): Promise<ReadMemoryFileResult | null> {
  const filePath = getMemoryFilePath(workspaceId, subdir, id)
  if (!existsSync(filePath)) {
    return null
  }

  const info = await stat(filePath)
  const content = await readFile(filePath, 'utf-8')

  // Extract metadata from frontmatter or content header
  const metadata = extractMemoryMetadata(content, id)

  const entry: MemoryFileEntry = {
    id,
    title: metadata.title || id,
    subdir,
    relativePath: path.join(MEMORY_DIR_NAME, subdir, `${id}.md`),
    absolutePath: filePath,
    size: info.size,
    createdAt: info.birthtime.toISOString(),
    updatedAt: info.mtime.toISOString(),
  }

  return { entry, content, metadata: { ...metadata, id, subdir } }
}

/**
 * 按关键词搜索记忆文件（全文搜索）
 */
export async function searchMemoryFiles(
  workspaceId: string,
  query: string
): Promise<Array<{ entry: MemoryFileEntry; matchedContent: string }>> {
  const files = await listMemoryFiles(workspaceId)
  const results: Array<{ entry: MemoryFileEntry; matchedContent: string }> = []
  const lowerQuery = query.toLowerCase()

  for (const file of files) {
    try {
      const content = await readFile(file.absolutePath, 'utf-8')
      const lowerContent = content.toLowerCase()
      if (lowerContent.includes(lowerQuery)) {
        // Find the line containing the match
        const lines = content.split('\n')
        const matchedLine = lines.find(line => line.toLowerCase().includes(lowerQuery))
        results.push({
          entry: file,
          matchedContent: matchedLine || content.slice(0, 200),
        })
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results
}

// ============================================
// Write operations
// ============================================

/**
 * 确保记忆目录存在
 */
export async function ensureMemoryDir(workspaceId: string): Promise<string> {
  await ensureWorkspaceRoot(workspaceId)
  await ensureMemoryDirs(workspaceId)
  return getMemoryRoot(workspaceId)
}

/**
 * 写入记忆文件（创建或更新）
 */
export async function writeMemoryFile(input: WriteMemoryFileInput): Promise<MemoryFileEntry> {
  await ensureMemoryDir(input.workspaceId)

  const filePath = getMemoryFilePath(input.workspaceId, input.subdir, input.id)
  const now = new Date().toISOString()

  // Format content with optional frontmatter
  const content = formatMemoryContent({
    title: input.title,
    tags: input.tags,
    importance: input.importance,
    summary: input.summary,
    body: input.content,
  })

  await writeFile(filePath, content, 'utf-8')
  const info = await stat(filePath)

  // Update index
  await updateMemoryIndex(input.workspaceId, {
    id: input.id,
    title: input.title,
    subdir: input.subdir,
    tags: input.tags,
    importance: input.importance,
    summary: input.summary,
    createdAt: info.birthtime.toISOString(),
    updatedAt: now,
  })

  return {
    id: input.id,
    title: input.title,
    subdir: input.subdir,
    relativePath: path.join(MEMORY_DIR_NAME, input.subdir, `${input.id}.md`),
    absolutePath: filePath,
    size: info.size,
    createdAt: info.birthtime.toISOString(),
    updatedAt: now,
  }
}

/**
 * 删除记忆文件
 */
export async function deleteMemoryFile(
  workspaceId: string,
  subdir: MemorySubdir,
  id: string
): Promise<boolean> {
  const filePath = getMemoryFilePath(workspaceId, subdir, id)
  if (!existsSync(filePath)) {
    return false
  }

  await rm(filePath, { force: true })

  // Update index
  await removeFromMemoryIndex(workspaceId, id)
  return true
}

/**
 * 批量删除同一子目录下的所有记忆文件
 */
export async function clearMemorySubdir(
  workspaceId: string,
  subdir: MemorySubdir
): Promise<number> {
  const subdirPath = getSubdirPath(workspaceId, subdir)
  if (!existsSync(subdirPath)) {
    return 0
  }

  const files = await readdir(subdirPath)
  let count = 0

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const id = file.replace(/\.md$/, '')
    await rm(path.join(subdirPath, file), { force: true })
    await removeFromMemoryIndex(workspaceId, id)
    count++
  }

  return count
}

/**
 * 清空整个记忆目录
 */
export async function clearAllMemoryFiles(workspaceId: string): Promise<void> {
  const root = getMemoryRoot(workspaceId)
  if (existsSync(root)) {
    await rm(root, { recursive: true, force: true })
  }
}

// ============================================
// Index operations
// ============================================

async function updateMemoryIndex(
  workspaceId: string,
  entry: {
    id: string
    title: string
    subdir: MemorySubdir
    tags?: string[]
    importance?: number
    summary?: string
    createdAt: string
    updatedAt: string
  }
): Promise<void> {
  const index = await readIndex(workspaceId) || {
    version: 1,
    lastUpdated: new Date().toISOString(),
    entries: [],
  }

  const existingIdx = index.entries.findIndex(e => e.id === entry.id)
  if (existingIdx >= 0) {
    index.entries[existingIdx] = entry
  } else {
    index.entries.push(entry)
  }

  index.lastUpdated = new Date().toISOString()
  await writeIndex(workspaceId, index)
}

async function removeFromMemoryIndex(workspaceId: string, id: string): Promise<void> {
  const index = await readIndex(workspaceId)
  if (!index) return

  index.entries = index.entries.filter(e => e.id !== id)
  index.lastUpdated = new Date().toISOString()
  await writeIndex(workspaceId, index)
}

/**
 * 获取记忆索引
 */
export async function getMemoryIndex(workspaceId: string): Promise<MemoryIndex | null> {
  return readIndex(workspaceId)
}

/**
 * 按子目录获取记忆索引条目
 */
export async function getMemoryIndexBySubdir(
  workspaceId: string,
  subdir: MemorySubdir
): Promise<MemoryIndex['entries']> {
  const index = await readIndex(workspaceId)
  if (!index) return []
  return index.entries.filter(e => e.subdir === subdir)
}

// ============================================
// Content formatting helpers
// ============================================

interface FormatMemoryContentInput {
  title: string
  tags?: string[]
  importance?: number
  summary?: string
  body: string
}

function formatMemoryContent(input: FormatMemoryContentInput): string {
  const frontmatter: string[] = ['---']
  frontmatter.push(`title: "${input.title.replace(/"/g, '\\"')}"`)

  if (input.tags && input.tags.length > 0) {
    frontmatter.push(`tags: [${input.tags.map(t => `"${t}"`).join(', ')}]`)
  }

  if (input.importance !== undefined) {
    frontmatter.push(`importance: ${input.importance}`)
  }

  if (input.summary) {
    frontmatter.push(`summary: "${input.summary.replace(/"/g, '\\"')}"`)
  }

  frontmatter.push('---')

  return [frontmatter.join('\n'), '', input.body].join('\n')
}

interface ExtractedMetadata {
  title: string
  tags: string[]
  importance: number
  summary: string
}

function extractMemoryMetadata(content: string, fallbackId: string): ExtractedMetadata {
  const result: ExtractedMetadata = {
    title: fallbackId,
    tags: [],
    importance: 5,
    summary: '',
  }

  // Check for YAML frontmatter
  if (!content.startsWith('---')) {
    // No frontmatter, use first line as title
    const lines = content.split('\n')
    if (lines.length > 0 && lines[0].trim()) {
      result.title = lines[0].replace(/^#+\s*/, '').trim() || fallbackId
    }
    return result
  }

  const endIdx = content.indexOf('---', 3)
  if (endIdx < 0) return result

  const frontmatter = content.slice(3, endIdx).trim()
  const bodyStart = endIdx + 3

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue

    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    switch (key) {
      case 'title':
        result.title = value.replace(/^["']|["']$/g, '')
        break
      case 'tags': {
        const match = value.match(/\[(.*)\]/)
        if (match) {
          result.tags = match[1]
            .split(',')
            .map(t => t.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean)
        }
        break
      }
      case 'importance':
        result.importance = parseInt(value, 10) || 5
        break
      case 'summary':
        result.summary = value.replace(/^["']|["']$/g, '')
        break
    }
  }

  // Extract summary from body if not in frontmatter
  if (!result.summary) {
    const body = content.slice(bodyStart).trim()
    const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    if (lines.length > 0) {
      result.summary = lines.slice(0, 2).join(' ').slice(0, 200)
    }
  }

  return result
}

// ============================================
// High-level helpers
// ============================================

/**
 * 加载所有记忆文件并格式化为上下文文本
 */
export async function loadAllMemoriesAsContext(workspaceId: string): Promise<string> {
  const files = await listMemoryFiles(workspaceId)
  if (files.length === 0) return ''

  const sections: string[] = ['## 自动记忆库（Auto Memory）', '']

  // Group by subdir
  const bySubdir = new Map<MemorySubdir, MemoryFileEntry[]>()
  for (const file of files) {
    const list = bySubdir.get(file.subdir) || []
    list.push(file)
    bySubdir.set(file.subdir, list)
  }

  for (const subdir of MEMORY_SUBDIRS) {
    const subdirFiles = bySubdir.get(subdir)
    if (!subdirFiles || subdirFiles.length === 0) continue

    sections.push(`### ${subdir}`)
    for (const file of subdirFiles) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8')
        const metadata = extractMemoryMetadata(content, file.id)

        // Strip frontmatter for display
        let body = content
        if (content.startsWith('---')) {
          const endIdx = content.indexOf('---', 3)
          if (endIdx >= 0) {
            body = content.slice(endIdx + 3).trim()
          }
        }

        sections.push(`#### ${metadata.title || file.id}`)
        sections.push(body.slice(0, 500)) // Limit each memory to 500 chars
        sections.push('')
      } catch {
        // Skip unreadable files
      }
    }
  }

  return sections.join('\n')
}

/**
 * 同步：将记忆文件批量导入到数据库（调用 personal-memory.ts）
 */
export async function syncMemoryFilesToDb(
  workspaceId: string,
  userId: string,
  swarmSessionId: string,
  agentId: string,
  createMemoryFn: (input: {
    userId: string
    workspaceId: string
    title: string
    content: string
    memoryType: string
    tags?: string[]
    importance?: number
    sourceRef?: string
  }) => Promise<unknown>
): Promise<number> {
  const files = await listMemoryFiles(workspaceId)
  let count = 0

  // Map subdir to memoryType
  const subdirToType: Record<MemorySubdir, string> = {
    background: 'PERSONAL',
    preference: 'PREFERENCE',
    skill: 'EXPERIENCE',
    fact: 'FACT',
    reflection: 'DREAM',
  }

  for (const file of files) {
    try {
      const content = await readFile(file.absolutePath, 'utf-8')
      const metadata = extractMemoryMetadata(content, file.id)

      // Strip frontmatter
      let body = content
      if (content.startsWith('---')) {
        const endIdx = content.indexOf('---', 3)
        if (endIdx >= 0) {
          body = content.slice(endIdx + 3).trim()
        }
      }

      await createMemoryFn({
        userId,
        workspaceId,
        title: metadata.title,
        content: body,
        memoryType: subdirToType[file.subdir],
        tags: metadata.tags,
        importance: metadata.importance,
        sourceRef: file.relativePath,
      })
      count++
    } catch {
      // Skip errors
    }
  }

  return count
}
