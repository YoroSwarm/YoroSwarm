import path from 'path'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import prisma from '@/lib/db'
import { extractFileText } from './file-text-extractor'
import { getSkillsPythonPackages } from './skills/python-dependencies'

const execFileAsync = promisify(execFile)
export const WORKSPACE_BASE_DIR = path.resolve(process.env.SWARM_WORKSPACE_DIR || './session-workspaces')
const VENV_DIR_NAME = '.venv'
const BASE_VENV_DIR = path.join(WORKSPACE_BASE_DIR, '.base-venv')

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
    // Text files
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    // Web
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.jsx': 'text/javascript',
    '.vue': 'text/x-vue',
    '.svelte': 'text/x-svelte',
    // Config & Data
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/x-toml',
    '.ini': 'text/x-ini',
    '.cfg': 'text/x-ini',
    '.conf': 'text/plain',
    // Shell & Scripts
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.zsh': 'text/x-shellscript',
    '.fish': 'text/x-shellscript',
    '.ps1': 'text/x-powershell',
    '.psm1': 'text/x-powershell',
    '.bat': 'text/x-msdos-batch',
    '.cmd': 'text/x-msdos-batch',
    // Python
    '.py': 'text/x-python',
    '.pyw': 'text/x-python',
    // Web languages
    '.php': 'text/x-php',
    '.rb': 'text/x-ruby',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    // C family
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.cc': 'text/x-c++',
    '.cxx': 'text/x-c++',
    '.h': 'text/x-c-header',
    '.hpp': 'text/x-c++-header',
    '.hxx': 'text/x-c++-header',
    '.cs': 'text/x-csharp',
    '.java': 'text/x-java',
    '.kt': 'text/x-kotlin',
    '.kts': 'text/x-kotlin',
    '.scala': 'text/x-scala',
    '.swift': 'text/x-swift',
    // Other languages
    '.sql': 'text/x-sql',
    '.r': 'text/x-r',
    '.R': 'text/x-r',
    '.lua': 'text/x-lua',
    '.pl': 'text/x-perl',
    '.pm': 'text/x-perl',
    '.ex': 'text/x-elixir',
    '.exs': 'text/x-elixir',
    '.erl': 'text/x-erlang',
    '.hrl': 'text/x-erlang',
    '.hs': 'text/x-haskell',
    '.fs': 'text/x-fsharp',
    '.fsx': 'text/x-fsharp',
    '.ml': 'text/x-ocaml',
    '.mli': 'text/x-ocaml',
    '.clj': 'text/x-clojure',
    '.cljs': 'text/x-clojure',
    '.cljc': 'text/x-clojure',
    '.dart': 'text/x-dart',
    '.groovy': 'text/x-groovy',
    '.gradle': 'text/x-groovy',
    // Shell/Docker
    '.dockerfile': 'text/x-dockerfile',
    // Documentation
    '.pdf': 'application/pdf',
    // Office
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    // Archives
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.tgz': 'application/gzip',
    '.bz2': 'application/x-bzip2',
    '.xz': 'application/x-xz',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/vnd.rar',
    // Fonts
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
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
 * 获取 base venv 的 Python 路径
 */
function getBaseVenvPythonPath(): string {
  return path.join(BASE_VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
}

/**
 * 检查 base venv 是否已完整存在（python 存在且包已安装）
 */
async function isBaseVenvReady(): Promise<boolean> {
  const basePythonPath = getBaseVenvPythonPath()
  const packagesReadyPath = path.join(BASE_VENV_DIR, '.venv_packages_ready')
  const [pythonExists, packagesReady] = await Promise.all([
    pathExists(basePythonPath),
    pathExists(packagesReadyPath),
  ])
  return pythonExists && packagesReady
}

/**
 * 创建 base venv（包含所有 skills 包）
 * 使用懒加载模式，首次需要时创建，后续复用
 */
async function ensureBaseVenv(): Promise<string> {
  // 检查是否已就绪
  if (await isBaseVenvReady()) {
    console.log('[Workspace] Using existing base venv')
    return BASE_VENV_DIR
  }

  // 检测系统 Python
  const pythonCmd = await detectPython()
  if (!pythonCmd) {
    console.warn('[Workspace] Python not found, cannot create base venv')
    return ''
  }

  // 如果目录存在但不完整，先删除
  const baseExists = await pathExists(BASE_VENV_DIR)
  if (baseExists) {
    console.log('[Workspace] Incomplete base venv found, removing for rebuild')
    try {
      await rm(BASE_VENV_DIR, { recursive: true, force: true })
    } catch {
      // 删除失败，继续
    }
  }

  // 确保父目录存在
  await mkdir(path.dirname(BASE_VENV_DIR), { recursive: true })

  try {
    console.log('[Workspace] Creating base venv...')
    await execFileAsync(pythonCmd, ['-m', 'venv', BASE_VENV_DIR], {
      timeout: 30000,
    })
    console.log('[Workspace] Base venv created, installing packages...')

    // 安装所有 skills 包
    const packages = getSkillsPythonPackages()
    if (packages.length > 0) {
      const basePython = getBaseVenvPythonPath()
      // 先升级 pip
      await execFileAsync(basePython, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
        timeout: 60000,
      })
      // 安装所有包
      await execFileAsync(basePython, [
        '-m', 'pip', 'install',
        ...packages,
      ], {
        timeout: 300000,
      })
    }

    // 创建 ready 标记
    await writeFile(path.join(BASE_VENV_DIR, '.venv_packages_ready'), 'ok', 'utf-8')
    console.log('[Workspace] Base venv ready')
    return BASE_VENV_DIR
  } catch (error) {
    console.warn('[Workspace] Failed to create base venv:', error)
    try {
      await rm(BASE_VENV_DIR, { recursive: true, force: true })
    } catch {
      // 忽略删除失败
    }
    return ''
  }
}

/**
 * 将 base venv 复制到目标路径
 * 使用 reflink（COW 硬链接）实现秒级复制
 */
async function copyVenv(from: string, to: string): Promise<void> {
  const isWindows = process.platform === 'win32'
  if (isWindows) {
    // Windows: 使用 robocopy /E /NJH /NJS 复制
    await execFileAsync('robocopy', ['/E', '/NJH', '/NJS', from, to], {
      timeout: 120000,
    })
  } else {
    // macOS/Linux: 使用 cp -r --reflink=auto 尝试 COW 复制，失败则用普通复制
    try {
      await execFileAsync('cp', ['-r', '--reflink=auto', from, to], {
        timeout: 120000,
      })
    } catch {
      // reflink 不支持（如跨文件系统），使用普通复制
      await execFileAsync('cp', ['-r', from, to], {
        timeout: 120000,
      })
    }
  }
}

/**
 * 创建会话级 Python 虚拟环境（如果尚不存在）
 * 优先从预构建的 base venv 复制，加速创建
 */
export async function ensureSessionVenv(swarmSessionId: string): Promise<string> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const venvBinPath = getSessionVenvBinPath(swarmSessionId)
  const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

  // 检查虚拟环境是否已完整存在（python 存在且包已安装）
  const packagesReadyPath = path.join(venvPath, '.venv_packages_ready')
  const [pythonExists, packagesReady] = await Promise.all([
    pathExists(pythonPath),
    pathExists(packagesReadyPath),
  ])

  // 如果 python 存在且包已安装，说明 venv 已完整初始化
  if (pythonExists && packagesReady) {
    return venvPath
  }

  // 如果 venv 目录存在但不完整（python 存在但包没装完，或 venv 创建失败），先删除
  const venvExists = await pathExists(venvPath)
  if (venvExists) {
    console.log(`[Workspace][${swarmSessionId}] Incomplete venv found, removing for retry`)
    try {
      await rm(venvPath, { recursive: true, force: true })
    } catch {
      // 删除失败，继续尝试使用现有的
    }
  }

  // 确保 base venv 存在
  const basePath = await ensureBaseVenv()
  if (!basePath) {
    console.warn(`[Workspace][${swarmSessionId}] Base venv unavailable, skipping venv creation`)
    return ''
  }

  try {
    console.log(`[Workspace][${swarmSessionId}] Copying venv from base...`)
    await copyVenv(basePath, venvPath)

    // 创建会话特定的 ready 标记
    await createVenvPackagesReadyMarker(swarmSessionId)
    await deleteVenvPackagesErrorMarker(swarmSessionId)

    console.log(`[Workspace][${swarmSessionId}] Venv ready (copied from base)`)
    return venvPath
  } catch (error) {
    console.warn(`[Workspace][${swarmSessionId}] Failed to copy venv:`, error)
    // 复制失败，清理
    try {
      await rm(venvPath, { recursive: true, force: true })
    } catch {
      // 忽略
    }
    return ''
  }
}


/**
 * 创建 venv 包安装完成的标记文件
 */
async function createVenvPackagesReadyMarker(swarmSessionId: string): Promise<void> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_ready')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // 忽略标记文件创建失败
  }
}

/**
 * 创建 venv 包安装失败的标记文件
 */
async function createVenvPackagesErrorMarker(swarmSessionId: string): Promise<void> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // 忽略标记文件创建失败
  }
}

/**
 * 删除 venv 包安装失败的标记文件
 */
async function deleteVenvPackagesErrorMarker(swarmSessionId: string): Promise<void> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await unlink(markerPath)
  } catch {
    // 忽略删除失败
  }
}

/**
 * 检查会话初始化状态
 * venvReady 不仅要求 python 存在，还要求包安装标记文件存在
 */
export async function checkSessionInitializationStatus(swarmSessionId: string): Promise<{
  venvReady: boolean
  workspaceReady: boolean
  venvStatus: 'initializing' | 'ready' | 'error'
}> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  const venvBinPath = getSessionVenvBinPath(swarmSessionId)
  const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')
  const packagesReadyPath = path.join(venvPath, '.venv_packages_ready')
  const packagesErrorPath = path.join(venvPath, '.venv_packages_error')
  const workspaceRoot = getSessionWorkspaceRoot(swarmSessionId)

  const [pythonExists, packagesReady, packagesError, workspaceReady] = await Promise.all([
    pathExists(pythonPath),
    pathExists(packagesReadyPath),
    pathExists(packagesErrorPath),
    pathExists(workspaceRoot),
  ])

  // venvReady 需要 python 存在且包安装完成
  const venvReady = pythonExists && packagesReady

  // 判断 venv 状态
  let venvStatus: 'initializing' | 'ready' | 'error' = 'initializing'
  if (venvReady) {
    venvStatus = 'ready'
  } else if (packagesError) {
    // 安装失败
    venvStatus = 'error'
  } else if (!pythonExists) {
    // venv 还没开始创建
    venvStatus = 'initializing'
  } else if (pythonExists && !packagesReady && !packagesError) {
    // python 存在但没有 ready 也没有 error，说明正在安装中
    venvStatus = 'initializing'
  }

  return { venvReady, workspaceReady, venvStatus }
}

/**
 * 删除虚拟环境（用于重试）
 */
export async function deleteSessionVenv(swarmSessionId: string): Promise<void> {
  const venvPath = getSessionVenvPath(swarmSessionId)
  try {
    await rm(venvPath, { recursive: true, force: true })
  } catch {
    // 忽略删除失败
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
