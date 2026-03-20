import path from 'path'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import prisma from '@/lib/db'
import { extractFileText } from './file-text-extractor'

const execFileAsync = promisify(execFile)
export const WORKSPACE_BASE_DIR = path.resolve(process.env.SWARM_WORKSPACE_DIR || './session-workspaces')
const VENV_DIR_NAME = '.venv'

type ManagedFileRecord = {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  createdAt: Date
  metadata: string | null
  path: string
}

export type WorkspaceFileMetadata = {
  relativePath?: string
  directoryPath?: string
  sourceTaskId?: string | null
  sourceAgentId?: string | null
  attachedTaskIds?: string[]
  kind?: 'upload' | 'agent_output' | 'task_attachment'
}

export type WorkspaceFileItem = {
  id: string
  relativePath: string
  directoryPath: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  url: string
  sourceTaskId?: string | null
  sourceAgentId?: string | null
  kind?: string
}

function parseMetadata(metadata: string | null | undefined): WorkspaceFileMetadata {
  if (!metadata) return {}
  try {
    return JSON.parse(metadata) as WorkspaceFileMetadata
  } catch {
    return {}
  }
}

export function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.jsx': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

// 工作区扫描时排除的目录名
const WORKSPACE_SCAN_EXCLUDE_DIRS = new Set(['.venv', 'node_modules', '__pycache__', '.git'])

async function scanWorkspaceFiles(
  root: string,
  relativeBase = ''
): Promise<Array<{ relativePath: string; absolutePath: string; size: number; createdAt: string }>> {
  const dirPath = relativeBase ? path.join(root, relativeBase) : root
  const dirents = await readdir(dirPath, { withFileTypes: true })
  const files: Array<{ relativePath: string; absolutePath: string; size: number; createdAt: string }> = []

  for (const dirent of dirents) {
    const relativePath = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name
    const absolutePath = path.join(dirPath, dirent.name)

    if (dirent.isDirectory()) {
      if (WORKSPACE_SCAN_EXCLUDE_DIRS.has(dirent.name)) continue
      files.push(...await scanWorkspaceFiles(root, relativePath))
      continue
    }

    if (!dirent.isFile()) {
      continue
    }

    const info = await stat(absolutePath)
    files.push({
      relativePath,
      absolutePath,
      size: info.size,
      createdAt: info.birthtime.toISOString(),
    })
  }

  return files
}

async function listManagedWorkspaceFiles(swarmSessionId: string): Promise<ManagedFileRecord[]> {
  return prisma.file.findMany({
    where: { swarmSessionId },
    orderBy: [
      { createdAt: 'asc' },
      { originalName: 'asc' },
    ],
  })
}

function buildSerializedItem(file: ManagedFileRecord) {
  const metadata = parseMetadata(file.metadata)
  const relativePath = metadata.relativePath || file.filename || file.originalName
  const directoryPath = metadata.directoryPath || path.posix.dirname(relativePath).replace(/^\.$/, '')

  return {
    id: file.id,
    relativePath,
    directoryPath,
    name: path.posix.basename(relativePath),
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
    url: `/api/files/${file.id}`,
    sourceTaskId: metadata.sourceTaskId,
    sourceAgentId: metadata.sourceAgentId,
    kind: metadata.kind,
  } satisfies WorkspaceFileItem
}

function buildUntrackedWorkspaceItem(input: { relativePath: string; size: number; createdAt: string }): WorkspaceFileItem {
  const directoryPath = path.posix.dirname(input.relativePath).replace(/^\.$/, '')
  return {
    id: `fs:${input.relativePath}`,
    relativePath: input.relativePath,
    directoryPath,
    name: path.posix.basename(input.relativePath),
    mimeType: inferMimeType(input.relativePath),
    size: input.size,
    createdAt: input.createdAt,
    url: '',
    kind: 'filesystem',
  }
}

export function normalizeWorkspaceRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim().replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    throw new Error('工作区路径不能为空')
  }

  const safeParts = parts.map((part) => {
    if (part === '.' || part === '..') {
      throw new Error('工作区路径不能包含 . 或 ..')
    }

    return part.replace(/[<>:"|?*\x00-\x1F]/g, '_')
  })

  return safeParts.join('/')
}

export function getSessionWorkspaceRoot(swarmSessionId: string): string {
  return path.join(WORKSPACE_BASE_DIR, swarmSessionId)
}

export async function ensureSessionWorkspaceRoot(swarmSessionId: string): Promise<string> {
  const root = getSessionWorkspaceRoot(swarmSessionId)
  await mkdir(root, { recursive: true })
  return root
}

/**
 * 获取会话工作区的 Python 虚拟环境路径
 */
export function getSessionVenvPath(swarmSessionId: string): string {
  return path.join(getSessionWorkspaceRoot(swarmSessionId), VENV_DIR_NAME)
}

/**
 * 获取虚拟环境的 bin 目录路径（用于 PATH 注入）
 */
export function getSessionVenvBinPath(swarmSessionId: string): string {
  const venvPath = getSessionVenvPath(swarmSessionId)
  return process.platform === 'win32'
    ? path.join(venvPath, 'Scripts')
    : path.join(venvPath, 'bin')
}

/**
 * 创建会话级 Python 虚拟环境（如果尚不存在）
 * 在工作区根目录下创建 .venv/ 目录
 */
export async function ensureSessionVenv(swarmSessionId: string): Promise<string> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const venvBinPath = getSessionVenvBinPath(swarmSessionId)
  const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

  // 检查虚拟环境是否已存在
  if (await pathExists(pythonPath)) {
    return venvPath
  }

  // 检测系统 Python
  const pythonCmd = await detectPython()
  if (!pythonCmd) {
    console.warn(`[Workspace][${swarmSessionId}] Python not found, skipping venv creation`)
    return ''
  }

  try {
    console.log(`[Workspace][${swarmSessionId}] Creating Python venv at ${venvPath}`)
    await execFileAsync(pythonCmd, ['-m', 'venv', venvPath], {
      cwd: getSessionWorkspaceRoot(swarmSessionId),
      timeout: 30000,
    })
    console.log(`[Workspace][${swarmSessionId}] Python venv created successfully`)
    return venvPath
  } catch (error) {
    console.warn(`[Workspace][${swarmSessionId}] Failed to create venv:`, error)
    return ''
  }
}

/**
 * 检测系统中可用的 Python 命令
 */
async function detectPython(): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ['--version'], { timeout: 5000 })
      return cmd
    } catch {
      // 尝试下一个
    }
  }
  return null
}

/**
 * 构建包含虚拟环境的 PATH 环境变量
 * 将 venv/bin 插入到 PATH 最前面，确保 python/pip 优先使用虚拟环境版本
 */
export function buildVenvEnvPath(swarmSessionId: string): string {
  const venvBin = getSessionVenvBinPath(swarmSessionId)
  const currentPath = process.env.PATH || ''
  return `${venvBin}${path.delimiter}${currentPath}`
}

export async function createWorkspaceDirectory(swarmSessionId: string, directoryPath: string): Promise<{ relativePath: string }> {
  const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, directoryPath)
  await mkdir(resolved.absolutePath, { recursive: true })
  return { relativePath: resolved.relativePath }
}

export async function resolveWorkspaceAbsolutePath(
  swarmSessionId: string,
  relativePath: string
): Promise<{ root: string; relativePath: string; absolutePath: string }> {
  const root = await ensureSessionWorkspaceRoot(swarmSessionId)
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  const absolutePath = path.join(root, normalized)

  if (!absolutePath.startsWith(root)) {
    throw new Error('工作区路径越界')
  }

  return { root, relativePath: normalized, absolutePath }
}

export async function resolveFileOwnerContext(
  swarmSessionId: string
): Promise<{ userId: string | null; sessionId: string }> {
  const swarmSession = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    select: { userId: true },
  })

  const userId = swarmSession?.userId || null
  if (!userId) {
    return { userId: null, sessionId: `swarm:${swarmSessionId}` }
  }

  const activeSession = await prisma.session.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
    orderBy: { lastUsedAt: 'desc' },
  }) || await prisma.session.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { lastUsedAt: 'desc' },
  })

  if (!activeSession) {
    throw new Error('当前用户没有可用的登录会话，无法登记文件记录')
  }

  return {
    userId,
    sessionId: activeSession.id,
  }
}

export async function findWorkspaceFileByPath(swarmSessionId: string, relativePath: string) {
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  const exact = await prisma.file.findFirst({
    where: {
      swarmSessionId,
      filename: normalized,
    },
  })

  if (exact) {
    return exact
  }

  const files = await prisma.file.findMany({ where: { swarmSessionId } })
  return files.find((file) => {
    const metadata = parseMetadata(file.metadata)
    return metadata.relativePath === normalized
  }) || null
}

export async function ensureUniqueWorkspaceRelativePath(
  swarmSessionId: string,
  desiredRelativePath: string
): Promise<string> {
  const normalized = normalizeWorkspaceRelativePath(desiredRelativePath)
  const ext = path.posix.extname(normalized)
  const base = ext ? normalized.slice(0, -ext.length) : normalized

  let candidate = normalized
  let counter = 1

  while (true) {
    const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, candidate)
    const [existsOnDisk, existingRecord] = await Promise.all([
      pathExists(resolved.absolutePath),
      findWorkspaceFileByPath(swarmSessionId, candidate),
    ])

    if (!existsOnDisk && !existingRecord) {
      return candidate
    }

    candidate = `${base}-${counter}${ext}`
    counter += 1
  }
}

export async function listWorkspaceFiles(
  swarmSessionId: string,
  options: { includeUntracked?: boolean } = {}
): Promise<WorkspaceFileItem[]> {
  const managedFiles = await listManagedWorkspaceFiles(swarmSessionId)
  const managedItems = managedFiles.map(buildSerializedItem)

  if (!options.includeUntracked) {
    return managedItems
  }

  const root = await ensureSessionWorkspaceRoot(swarmSessionId)
  const scannedFiles = await scanWorkspaceFiles(root)
  const merged = new Map<string, WorkspaceFileItem>(managedItems.map((item) => [item.relativePath, item] as const))

  for (const file of scannedFiles) {
    if (!merged.has(file.relativePath)) {
      merged.set(file.relativePath, buildUntrackedWorkspaceItem(file))
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export async function saveWorkspaceFile(input: {
  swarmSessionId: string
  relativePath: string
  content: string | Buffer
  mimeType: string
  metadata?: WorkspaceFileMetadata
  mode: 'create' | 'replace' | 'upsert'
}) {
  const { swarmSessionId, content, mimeType, mode } = input
  const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, input.relativePath)
  const existing = await findWorkspaceFileByPath(swarmSessionId, resolved.relativePath)
  const existsOnDisk = await pathExists(resolved.absolutePath)

  if (mode === 'create' && (existing || existsOnDisk)) {
    throw new Error(`文件已存在: ${resolved.relativePath}`)
  }

  if (mode === 'replace' && !existing && !existsOnDisk) {
    throw new Error(`文件不存在: ${resolved.relativePath}`)
  }

  await mkdir(path.dirname(resolved.absolutePath), { recursive: true })
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
  await writeFile(resolved.absolutePath, buffer)

  const nextMetadata: WorkspaceFileMetadata = {
    ...(existing ? parseMetadata(existing.metadata) : {}),
    ...(input.metadata || {}),
    relativePath: resolved.relativePath,
    directoryPath: path.posix.dirname(resolved.relativePath).replace(/^\.$/, ''),
  }

  if (existing) {
    if (existing.path !== resolved.absolutePath) {
      try {
        await unlink(existing.path)
      } catch {}
    }

    return prisma.file.update({
      where: { id: existing.id },
      data: {
        filename: resolved.relativePath,
        originalName: path.posix.basename(resolved.relativePath),
        mimeType,
        size: buffer.byteLength,
        path: resolved.absolutePath,
        metadata: JSON.stringify(nextMetadata),
      },
    })
  }

  const { userId, sessionId } = await resolveFileOwnerContext(swarmSessionId)
  return prisma.file.create({
    data: {
      filename: resolved.relativePath,
      originalName: path.posix.basename(resolved.relativePath),
      mimeType,
      size: buffer.byteLength,
      path: resolved.absolutePath,
      sessionId,
      swarmSessionId,
      userId,
      metadata: JSON.stringify(nextMetadata),
    },
  })
}

export async function readWorkspaceFile(swarmSessionId: string, relativePath: string) {
  const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, relativePath)
  const info = await stat(resolved.absolutePath).catch(() => null)

  if (!info || !info.isFile()) {
    throw new Error(`文件不存在: ${relativePath}`)
  }

  const fileRecord = await findWorkspaceFileByPath(swarmSessionId, resolved.relativePath)
  const mimeType = fileRecord?.mimeType || inferMimeType(resolved.relativePath)
  const originalName = fileRecord?.originalName || path.posix.basename(resolved.relativePath)

  const extracted = await extractFileText({
    filePath: resolved.absolutePath,
    filename: originalName,
    mimeType,
  })

  return {
    file: fileRecord || {
      id: `fs:${resolved.relativePath}`,
      path: resolved.absolutePath,
      filename: resolved.relativePath,
      originalName,
      mimeType,
      size: info.size,
      metadata: JSON.stringify({ relativePath: resolved.relativePath }),
    },
    extracted,
  }
}

export async function attachFilesToTaskMetadata(
  swarmSessionId: string,
  taskId: string,
  fileIds: string[]
) {
  const files = await prisma.file.findMany({
    where: {
      swarmSessionId,
      id: { in: fileIds },
    },
  })

  await Promise.all(files.map((file) => {
    const metadata = parseMetadata(file.metadata)
    const attachedTaskIds = new Set(metadata.attachedTaskIds || [])
    attachedTaskIds.add(taskId)
    return prisma.file.update({
      where: { id: file.id },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          attachedTaskIds: Array.from(attachedTaskIds),
          kind: metadata.kind || 'task_attachment',
        }),
      },
    })
  }))
}

export async function listFilesForTask(swarmSessionId: string, taskId: string): Promise<WorkspaceFileItem[]> {
  const files = await listWorkspaceFiles(swarmSessionId)
  return files.filter((file) => {
    return file.sourceTaskId === taskId || Boolean(getAttachedTaskIdsFromItem(file).includes(taskId))
  })
}

function getAttachedTaskIdsFromItem(file: WorkspaceFileItem): string[] {
  const raw = file as WorkspaceFileItem & { attachedTaskIds?: string[] }
  return raw.attachedTaskIds || []
}

export async function listFilesForTaskIds(swarmSessionId: string, taskIds: string[]) {
  const allFiles = await prisma.file.findMany({ where: { swarmSessionId } })

  return allFiles
    .map((file) => ({ file, metadata: parseMetadata(file.metadata) }))
    .filter(({ metadata }) => {
      const attached = metadata.attachedTaskIds || []
      return Boolean(
        (metadata.sourceTaskId && taskIds.includes(metadata.sourceTaskId))
        || attached.some((taskId) => taskIds.includes(taskId))
      )
    })
}

export async function listWorkspaceDirectory(
  swarmSessionId: string,
  directoryPath: string = '',
  recursive: boolean = false
) {
  const root = await ensureSessionWorkspaceRoot(swarmSessionId)
  const normalizedDir = directoryPath ? normalizeWorkspaceRelativePath(directoryPath) : ''
  const targetDir = normalizedDir ? path.join(root, normalizedDir) : root

  if (!targetDir.startsWith(root)) {
    throw new Error('工作区路径越界')
  }

  try {
    const info = await stat(targetDir)
    if (!info.isDirectory()) {
      throw new Error(`不是目录: ${normalizedDir}`)
    }
  } catch (error) {
    if (normalizedDir) {
      throw error
    }
    await mkdir(targetDir, { recursive: true })
  }

  const managedFiles = await listManagedWorkspaceFiles(swarmSessionId)
  const managedByRelativePath = new Map(
    managedFiles.map((file) => {
      const metadata = parseMetadata(file.metadata)
      const relativePath = metadata.relativePath || file.filename || file.originalName
      return [relativePath, file] as const
    })
  )

  const scan = async (dirPath: string, relativeBase: string): Promise<Array<{ path: string; name: string; type: 'file' | 'directory'; mimeType?: string; size?: number }>> => {
    const dirents = await readdir(dirPath, { withFileTypes: true })
    const entries: Array<{ path: string; name: string; type: 'file' | 'directory'; mimeType?: string; size?: number }> = []

    for (const dirent of dirents) {
      const relPath = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name
      const absPath = path.join(dirPath, dirent.name)

      if (dirent.isDirectory()) {
        if (WORKSPACE_SCAN_EXCLUDE_DIRS.has(dirent.name)) continue
        entries.push({ path: relPath, name: dirent.name, type: 'directory' })
        if (recursive) {
          entries.push(...await scan(absPath, relPath))
        }
        continue
      }

      if (!dirent.isFile()) continue
      const fileRecord = managedByRelativePath.get(relPath)
      const fileStat = await stat(absPath)
      entries.push({
        path: relPath,
        name: dirent.name,
        type: 'file',
        mimeType: fileRecord?.mimeType || inferMimeType(relPath),
        size: fileStat.size,
      })
    }

    return entries
  }

  const entries = await scan(targetDir, normalizedDir)
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  return {
    directoryPath: normalizedDir,
    entries,
  }
}

export async function readRawWorkspaceFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8')
}

export async function deleteSessionWorkspace(swarmSessionId: string): Promise<void> {
  const root = getSessionWorkspaceRoot(swarmSessionId)
  const exists = await pathExists(root)
  if (exists) {
    await rm(root, { recursive: true, force: true })
  }
}
