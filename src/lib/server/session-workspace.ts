import path from 'path'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import prisma from '@/lib/db'
import { extractFileText } from './file-text-extractor'
import { getSkillsPythonPackages } from './skills/python-dependencies'

const execFileAsync = promisify(execFile)
export const WORKSPACE_BASE_DIR = path.resolve(process.env.SWARM_WORKSPACE_DIR || './workspaces')
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

// ---------------------------------------------------------------------------
// Workspace ID resolution: map legacy swarmSessionId -> workspaceId
// ---------------------------------------------------------------------------

async function resolveWorkspaceId(swarmSessionId: string): Promise<string> {
  const session = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    select: { workspaceId: true },
  })
  if (!session?.workspaceId) throw new Error(`Session ${swarmSessionId} has no workspace`)
  return session.workspaceId
}

// ---------------------------------------------------------------------------
// Workspace-scoped primary functions (use workspaceId directly)
// ---------------------------------------------------------------------------

export function getWorkspaceRoot(workspaceId: string): string {
  return path.join(WORKSPACE_BASE_DIR, workspaceId)
}

export async function ensureWorkspaceRoot(workspaceId: string): Promise<string> {
  const root = getWorkspaceRoot(workspaceId)
  await mkdir(root, { recursive: true })
  return root
}

export function getWorkspaceVenvPath(workspaceId: string): string {
  return path.join(getWorkspaceRoot(workspaceId), VENV_DIR_NAME)
}

export function getWorkspaceVenvBinPath(workspaceId: string): string {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  return process.platform === 'win32'
    ? path.join(venvPath, 'Scripts')
    : path.join(venvPath, 'bin')
}

export async function ensureWorkspaceVenv(workspaceId: string): Promise<string> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  const venvBinPath = getWorkspaceVenvBinPath(workspaceId)
  const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

  const packagesReadyPath = path.join(venvPath, '.venv_packages_ready')
  const [pythonExists, packagesReady] = await Promise.all([
    pathExists(pythonPath),
    pathExists(packagesReadyPath),
  ])

  if (pythonExists && packagesReady) {
    return venvPath
  }

  const venvExists = await pathExists(venvPath)
  if (venvExists) {
    console.log(`[Workspace][${workspaceId}] Incomplete venv found, removing for retry`)
    try {
      await rm(venvPath, { recursive: true, force: true })
    } catch {
      // continue
    }
  }

  const basePath = await ensureBaseVenv()
  if (!basePath) {
    console.warn(`[Workspace][${workspaceId}] Base venv unavailable, skipping venv creation`)
    return ''
  }

  try {
    console.log(`[Workspace][${workspaceId}] Copying venv from base...`)
    await copyVenv(basePath, venvPath)

    await createWorkspaceVenvPackagesReadyMarker(workspaceId)
    await deleteWorkspaceVenvPackagesErrorMarker(workspaceId)

    console.log(`[Workspace][${workspaceId}] Venv ready (copied from base)`)
    return venvPath
  } catch (error) {
    console.warn(`[Workspace][${workspaceId}] Failed to copy venv:`, error)
    await createWorkspaceVenvPackagesErrorMarker(workspaceId)
    try {
      await rm(venvPath, { recursive: true, force: true })
    } catch {
      // ignore
    }
    return ''
  }
}

export function buildWorkspaceVenvEnvPath(workspaceId: string): string {
  const venvBin = getWorkspaceVenvBinPath(workspaceId)
  const currentPath = process.env.PATH || ''
  return `${venvBin}${path.delimiter}${currentPath}`
}

export async function checkWorkspaceInitializationStatus(workspaceId: string): Promise<{
  venvReady: boolean
  workspaceReady: boolean
  venvStatus: 'initializing' | 'ready' | 'error'
}> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  const venvBinPath = getWorkspaceVenvBinPath(workspaceId)
  const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')
  const packagesReadyPath = path.join(venvPath, '.venv_packages_ready')
  const packagesErrorPath = path.join(venvPath, '.venv_packages_error')
  const workspaceRoot = getWorkspaceRoot(workspaceId)

  const [pythonExists, packagesReady, packagesError, workspaceReady] = await Promise.all([
    pathExists(pythonPath),
    pathExists(packagesReadyPath),
    pathExists(packagesErrorPath),
    pathExists(workspaceRoot),
  ])

  const venvReady = pythonExists && packagesReady

  let venvStatus: 'initializing' | 'ready' | 'error' = 'initializing'
  if (venvReady) {
    venvStatus = 'ready'
  } else if (packagesError) {
    venvStatus = 'error'
  } else if (!pythonExists) {
    venvStatus = 'initializing'
  } else if (pythonExists && !packagesReady && !packagesError) {
    venvStatus = 'initializing'
  }

  return { venvReady, workspaceReady, venvStatus }
}

export async function deleteWorkspaceDirectory(workspaceId: string): Promise<void> {
  const root = getWorkspaceRoot(workspaceId)
  const exists = await pathExists(root)
  if (exists) {
    await rm(root, { recursive: true, force: true })
  }
}

export async function deleteWorkspaceVenv(workspaceId: string): Promise<void> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  try {
    await rm(venvPath, { recursive: true, force: true })
  } catch {
    // 忽略删除失败
  }
}

// ---------------------------------------------------------------------------
// Workspace-scoped venv marker helpers
// ---------------------------------------------------------------------------

async function createWorkspaceVenvPackagesReadyMarker(workspaceId: string): Promise<void> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  const markerPath = path.join(venvPath, '.venv_packages_ready')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // ignore
  }
}

async function createWorkspaceVenvPackagesErrorMarker(workspaceId: string): Promise<void> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // ignore
  }
}

async function deleteWorkspaceVenvPackagesErrorMarker(workspaceId: string): Promise<void> {
  const venvPath = getWorkspaceVenvPath(workspaceId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await unlink(markerPath)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Managed file helpers (workspace-scoped)
// ---------------------------------------------------------------------------

async function listManagedWorkspaceFilesByWorkspaceId(workspaceId: string): Promise<ManagedFileRecord[]> {
  return prisma.file.findMany({
    where: { workspaceId },
    orderBy: [
      { createdAt: 'asc' },
      { originalName: 'asc' },
    ],
  })
}

async function findWorkspaceFileByPathAndWorkspaceId(workspaceId: string, relativePath: string) {
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  const exact = await prisma.file.findFirst({
    where: {
      workspaceId,
      filename: normalized,
    },
  })

  if (exact) {
    return exact
  }

  const files = await prisma.file.findMany({ where: { workspaceId } })
  return files.find((file) => {
    const metadata = parseMetadata(file.metadata)
    return metadata.relativePath === normalized
  }) || null
}

// ---------------------------------------------------------------------------
// Deprecated session-scoped wrappers (resolve workspaceId via DB lookup)
// ---------------------------------------------------------------------------

/** @deprecated Use listManagedWorkspaceFilesByWorkspaceId instead */
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

/** @deprecated Use getWorkspaceRoot(workspaceId) instead */
export async function getSessionWorkspaceRoot(swarmSessionId: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return getWorkspaceRoot(workspaceId)
}

/** @deprecated Use ensureWorkspaceRoot(workspaceId) instead */
export async function ensureSessionWorkspaceRoot(swarmSessionId: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return ensureWorkspaceRoot(workspaceId)
}

/**
 * @deprecated Use getWorkspaceVenvPath(workspaceId) instead
 */
export async function getSessionVenvPath(swarmSessionId: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return getWorkspaceVenvPath(workspaceId)
}

/**
 * @deprecated Use getWorkspaceVenvBinPath(workspaceId) instead
 */
export async function getSessionVenvBinPath(swarmSessionId: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return getWorkspaceVenvBinPath(workspaceId)
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
 * @deprecated Use ensureWorkspaceVenv(workspaceId) instead
 */
export async function ensureSessionVenv(swarmSessionId: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return ensureWorkspaceVenv(workspaceId)
}


/**
 * 创建 venv 包安装完成的标记文件
 * @deprecated No longer used; kept for backwards compatibility
 */
async function createVenvPackagesReadyMarker(swarmSessionId: string): Promise<void> {
  const venvPath = await getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_ready')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // 忽略标记文件创建失败
  }
}

/**
 * 创建 venv 包安装失败的标记文件
 * @deprecated No longer used; kept for backwards compatibility
 */
async function createVenvPackagesErrorMarker(swarmSessionId: string): Promise<void> {
  const venvPath = await getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await writeFile(markerPath, 'ok', 'utf-8')
  } catch {
    // 忽略标记文件创建失败
  }
}

/**
 * 删除 venv 包安装失败的标记文件
 * @deprecated No longer used; kept for backwards compatibility
 */
async function deleteVenvPackagesErrorMarker(swarmSessionId: string): Promise<void> {
  const venvPath = await getSessionVenvPath(swarmSessionId)
  const markerPath = path.join(venvPath, '.venv_packages_error')
  try {
    await unlink(markerPath)
  } catch {
    // 忽略删除失败
  }
}

/**
 * @deprecated Use checkWorkspaceInitializationStatus(workspaceId) instead
 */
export async function checkSessionInitializationStatus(swarmSessionId: string): Promise<{
  venvReady: boolean
  workspaceReady: boolean
  venvStatus: 'initializing' | 'ready' | 'error'
}> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return checkWorkspaceInitializationStatus(workspaceId)
}

/**
 * @deprecated Use deleteWorkspaceDirectory(workspaceId) instead, or call getWorkspaceVenvPath directly
 */
export async function deleteSessionVenv(swarmSessionId: string): Promise<void> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  const venvPath = getWorkspaceVenvPath(workspaceId)
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
 * @deprecated Use buildWorkspaceVenvEnvPath(workspaceId) instead
 */
export async function buildVenvEnvPath(swarmSessionId: string): Promise<string> {
  const venvBin = await getSessionVenvBinPath(swarmSessionId)
  const currentPath = process.env.PATH || ''
  return `${venvBin}${path.delimiter}${currentPath}`
}

export async function resolveWorkspaceAbsolutePath(
  swarmSessionId: string,
  relativePath: string
): Promise<{ root: string; relativePath: string; absolutePath: string }> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return resolveWorkspaceAbsolutePathByWorkspaceId(workspaceId, relativePath)
}

export async function resolveWorkspaceAbsolutePathByWorkspaceId(
  workspaceId: string,
  relativePath: string
): Promise<{ root: string; relativePath: string; absolutePath: string }> {
  const root = await ensureWorkspaceRoot(workspaceId)
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  const absolutePath = path.join(root, normalized)

  if (!absolutePath.startsWith(root)) {
    throw new Error('工作区路径越界')
  }

  return { root, relativePath: normalized, absolutePath }
}

export async function createWorkspaceDirectory(swarmSessionId: string, directoryPath: string): Promise<{ relativePath: string }> {
  const resolved = await resolveWorkspaceAbsolutePath(swarmSessionId, directoryPath)
  await mkdir(resolved.absolutePath, { recursive: true })
  return { relativePath: resolved.relativePath }
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

/**
 * @deprecated Use findWorkspaceFileByPathAndWorkspaceId(workspaceId, relativePath) instead
 */
export async function findWorkspaceFileByPath(swarmSessionId: string, relativePath: string) {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return findWorkspaceFileByPathAndWorkspaceId(workspaceId, relativePath)
}

export async function ensureUniqueWorkspaceRelativePath(
  swarmSessionId: string,
  desiredRelativePath: string
): Promise<string> {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return ensureUniqueWorkspaceRelativePathByWorkspaceId(workspaceId, desiredRelativePath)
}

export async function ensureUniqueWorkspaceRelativePathByWorkspaceId(
  workspaceId: string,
  desiredRelativePath: string
): Promise<string> {
  const normalized = normalizeWorkspaceRelativePath(desiredRelativePath)
  const ext = path.posix.extname(normalized)
  const base = ext ? normalized.slice(0, -ext.length) : normalized

  let candidate = normalized
  let counter = 1

  while (true) {
    const resolved = await resolveWorkspaceAbsolutePathByWorkspaceId(workspaceId, candidate)
    const [existsOnDisk, existingRecord] = await Promise.all([
      pathExists(resolved.absolutePath),
      findWorkspaceFileByPathAndWorkspaceId(workspaceId, candidate),
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
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return listWorkspaceFilesByWorkspaceId(workspaceId, options)
}

export async function listWorkspaceFilesByWorkspaceId(
  workspaceId: string,
  options: { includeUntracked?: boolean } = {}
): Promise<WorkspaceFileItem[]> {
  const managedFiles = await listManagedWorkspaceFilesByWorkspaceId(workspaceId)
  const managedItems = managedFiles.map(buildSerializedItem)

  if (!options.includeUntracked) {
    return managedItems
  }

  const root = await ensureWorkspaceRoot(workspaceId)
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
  const workspaceId = await resolveWorkspaceId(input.swarmSessionId)
  return saveWorkspaceFileByWorkspaceId({
    workspaceId,
    swarmSessionId: input.swarmSessionId,
    relativePath: input.relativePath,
    content: input.content,
    mimeType: input.mimeType,
    metadata: input.metadata,
    mode: input.mode,
  })
}

export async function saveWorkspaceFileByWorkspaceId(input: {
  workspaceId: string
  swarmSessionId?: string
  relativePath: string
  content: string | Buffer
  mimeType: string
  metadata?: WorkspaceFileMetadata
  mode: 'create' | 'replace' | 'upsert'
}) {
  const { content, mimeType, mode, workspaceId, swarmSessionId } = input
  const resolved = await resolveWorkspaceAbsolutePathByWorkspaceId(workspaceId, input.relativePath)
  const existing = await findWorkspaceFileByPathAndWorkspaceId(workspaceId, resolved.relativePath)
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

  const ownerContext = swarmSessionId
    ? await resolveFileOwnerContext(swarmSessionId)
    : { userId: null, sessionId: '' }
  return prisma.file.create({
    data: {
      filename: resolved.relativePath,
      originalName: path.posix.basename(resolved.relativePath),
      mimeType,
      size: buffer.byteLength,
      path: resolved.absolutePath,
      sessionId: ownerContext.sessionId,
      workspaceId,
      swarmSessionId: swarmSessionId || null,
      userId: ownerContext.userId,
      metadata: JSON.stringify(nextMetadata),
    },
  })
}

export async function readWorkspaceFile(swarmSessionId: string, relativePath: string) {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  return readWorkspaceFileByWorkspaceId(workspaceId, relativePath)
}

export async function readWorkspaceFileByWorkspaceId(workspaceId: string, relativePath: string) {
  const resolved = await resolveWorkspaceAbsolutePathByWorkspaceId(workspaceId, relativePath)
  const info = await stat(resolved.absolutePath).catch(() => null)

  if (!info || !info.isFile()) {
    throw new Error(`文件不存在: ${relativePath}`)
  }

  const fileRecord = await findWorkspaceFileByPathAndWorkspaceId(workspaceId, resolved.relativePath)
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
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  const files = await prisma.file.findMany({
    where: {
      workspaceId,
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
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  const files = await listWorkspaceFilesByWorkspaceId(workspaceId)
  return files.filter((file) => {
    return file.sourceTaskId === taskId || Boolean(getAttachedTaskIdsFromItem(file).includes(taskId))
  })
}

function getAttachedTaskIdsFromItem(file: WorkspaceFileItem): string[] {
  const raw = file as WorkspaceFileItem & { attachedTaskIds?: string[] }
  return raw.attachedTaskIds || []
}

export async function listFilesForTaskIds(swarmSessionId: string, taskIds: string[]) {
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  const allFiles = await prisma.file.findMany({ where: { workspaceId } })

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
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  const root = await ensureWorkspaceRoot(workspaceId)
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

  const managedFiles = await listManagedWorkspaceFilesByWorkspaceId(workspaceId)
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
  const workspaceId = await resolveWorkspaceId(swarmSessionId)
  await deleteWorkspaceDirectory(workspaceId)
}
