/**
 * SKILL.md 标准解析器
 *
 * 严格遵循 Agent Skills 规范：
 * - YAML frontmatter: name (必填), description (必填), license, allowed-tools, compatibility, metadata
 * - Markdown body: 完整 instructions
 * - 不识别/不添加任何自定义字段
 */

import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'

// ============================================
// 类型定义（标准规范字段）
// ============================================

export interface SkillMetadata {
  name: string
  description: string
  license?: string
  allowedTools?: string[]
  compatibility?: string | string[]
  metadata?: Record<string, unknown>
}

export interface ParsedSkill {
  metadata: SkillMetadata
  instructions: string
  basePath: string
  hasScripts: boolean
  scriptFiles: string[]
}

export interface SkillSummary {
  name: string
  description: string
  source: 'registry' | 'custom'
  hasScripts: boolean
  isEnabled: boolean
}

// ============================================
// YAML Frontmatter 解析（轻量实现，无外部依赖）
// ============================================

/**
 * 从 SKILL.md 内容中提取 YAML frontmatter 和 Markdown body
 */
function extractFrontmatter(content: string): { yaml: string; body: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return null
  return {
    yaml: match[1].trim(),
    body: match[2].trim(),
  }
}

/**
 * 简易 YAML 解析器
 * 支持：字符串、数组（- item 形式）、嵌套对象（缩进形式）、带引号的字符串
 * 用途：解析 SKILL.md frontmatter，避免引入 js-yaml 依赖
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let currentKey: string | null = null
  let currentArray: string[] | null = null
  let currentObject: Record<string, unknown> | null = null
  let objectKey: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')

    // 空行或注释
    if (!line.trim() || line.trim().startsWith('#')) continue

    // 数组项（缩进 + -）
    if (currentArray !== null && /^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      currentArray.push(stripQuotes(value))
      continue
    }

    // 嵌套对象项（缩进 key: value）
    if (currentObject !== null && objectKey !== null && /^\s+\S/.test(line)) {
      const objMatch = line.match(/^\s+([^:]+):\s*(.*)$/)
      if (objMatch) {
        currentObject[objMatch[1].trim()] = stripQuotes(objMatch[2].trim())
        continue
      }
    }

    // 完成之前的数组/对象收集
    if (currentArray !== null && currentKey !== null) {
      result[currentKey] = currentArray
      currentArray = null
      currentKey = null
    }
    if (currentObject !== null && objectKey !== null) {
      result[objectKey] = currentObject
      currentObject = null
      objectKey = null
    }

    // 顶层 key: value
    const kvMatch = line.match(/^([^:]+):\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1].trim()
    const value = kvMatch[2].trim()

    if (value === '' || value === '|' || value === '>') {
      // 可能是数组或对象的开始
      currentKey = key
      currentArray = []
      objectKey = key
      currentObject = {}
      continue
    }

    // 内联数组 [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean)
      result[key] = items
      continue
    }

    // 普通标量值
    result[key] = stripQuotes(value)
  }

  // 收尾
  if (currentArray !== null && currentKey !== null && currentArray.length > 0) {
    result[currentKey] = currentArray
  } else if (currentObject !== null && objectKey !== null && Object.keys(currentObject).length > 0) {
    result[objectKey] = currentObject
  }

  return result
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

// ============================================
// 核心解析函数
// ============================================

/**
 * 从 YAML 解析结果构建 SkillMetadata
 */
function buildMetadata(raw: Record<string, unknown>): SkillMetadata {
  const name = typeof raw.name === 'string' ? raw.name : ''
  const description = typeof raw.description === 'string' ? raw.description : ''

  if (!name) throw new Error('SKILL.md missing required field: name')
  if (!description) throw new Error('SKILL.md missing required field: description')

  // 标准名称校验：1-64 字符，小写字母数字加连字符
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must be 1-64 lowercase alphanumeric chars with hyphens.`)
  }

  if (description.length > 1024) {
    throw new Error(`Skill description too long (${description.length} chars, max 1024)`)
  }

  const metadata: SkillMetadata = { name, description }

  if (typeof raw.license === 'string') {
    metadata.license = raw.license
  }

  // allowed-tools 可以是数组或空格分隔的字符串
  const allowedTools = raw['allowed-tools']
  if (Array.isArray(allowedTools)) {
    metadata.allowedTools = allowedTools.map(String)
  } else if (typeof allowedTools === 'string') {
    metadata.allowedTools = allowedTools.split(/\s+/).filter(Boolean)
  }

  // compatibility 可以是字符串或数组
  if (raw.compatibility) {
    metadata.compatibility = raw.compatibility as string | string[]
  }

  // metadata 通用扩展字段
  if (raw.metadata && typeof raw.metadata === 'object') {
    metadata.metadata = raw.metadata as Record<string, unknown>
  }

  return metadata
}

/**
 * 解析单个 SKILL.md 文件内容
 */
export function parseSkillMd(content: string): { metadata: SkillMetadata; instructions: string } {
  const parts = extractFrontmatter(content)
  if (!parts) {
    throw new Error('SKILL.md must start with YAML frontmatter (---)')
  }

  const raw = parseSimpleYaml(parts.yaml)
  const metadata = buildMetadata(raw)

  return { metadata, instructions: parts.body }
}

/**
 * 从目录加载并解析完整 Skill
 */
export async function loadSkillFromDirectory(skillDir: string): Promise<ParsedSkill> {
  const skillMdPath = path.join(skillDir, 'SKILL.md')

  let content: string
  try {
    content = await readFile(skillMdPath, 'utf-8')
  } catch {
    throw new Error(`SKILL.md not found at: ${skillMdPath}`)
  }

  const { metadata, instructions } = parseSkillMd(content)

  // 检查 scripts/ 目录
  const scriptsDir = path.join(skillDir, 'scripts')
  let hasScripts = false
  let scriptFiles: string[] = []

  try {
    const scriptsStat = await stat(scriptsDir)
    if (scriptsStat.isDirectory()) {
      hasScripts = true
      scriptFiles = await scanScriptFiles(scriptsDir)
    }
  } catch {
    // scripts/ 不存在，这是正常的
  }

  return {
    metadata,
    instructions,
    basePath: skillDir,
    hasScripts,
    scriptFiles,
  }
}

/**
 * 递归扫描 scripts/ 目录下的所有文件（返回相对于 scripts/ 的路径）
 */
async function scanScriptFiles(dir: string, prefix = ''): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const subFiles = await scanScriptFiles(path.join(dir, entry.name), relativePath)
      files.push(...subFiles)
    } else {
      files.push(relativePath)
    }
  }

  return files
}

/**
 * 快速读取 Skill 目录的 metadata（不加载完整 instructions）
 */
export async function loadSkillMetadata(skillDir: string): Promise<SkillMetadata> {
  const skillMdPath = path.join(skillDir, 'SKILL.md')
  const content = await readFile(skillMdPath, 'utf-8')
  const { metadata } = parseSkillMd(content)
  return metadata
}
