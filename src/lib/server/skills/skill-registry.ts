/**
 * Skill 注册表服务
 *
 * 职责：
 * - 扫描 skills/_registry/ 获取预置 Skills
 * - 扫描 skills/users/{userId}/ 获取用户自定义 Skills
 * - 管理 UserSkill 数据库记录（安装/启用/禁用/卸载）
 * - 按需加载完整 Skill 内容
 */

import path from 'path'
import { readdir, stat, mkdir, cp, rm, symlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import prisma from '@/lib/db'
import {
  loadSkillFromDirectory,
  loadSkillMetadata,
  type ParsedSkill,
  type SkillMetadata,
  type SkillSummary,
} from './skill-parser'
import { isSkillWithLocalPackage } from './python-dependencies'
import { ensureSessionVenv, getSessionVenvBinPath } from '../session-workspace'

const execFileAsync = promisify(execFile)

// ============================================
// 路径常量
// ============================================

const SKILLS_BASE_DIR = path.resolve(process.env.SWARM_SKILLS_DIR || './skills')
const REGISTRY_DIR = path.join(SKILLS_BASE_DIR, '_registry')
const USERS_DIR = path.join(SKILLS_BASE_DIR, 'users')

function getUserSkillsDir(userId: string): string {
  return path.join(USERS_DIR, userId)
}

// ============================================
// Skill 扫描
// ============================================

/**
 * 扫描指定目录下的所有 Skill 目录
 * 每个子目录如果包含 SKILL.md 则被视为一个 Skill
 */
async function scanSkillDirectories(baseDir: string): Promise<{ name: string; path: string }[]> {
  const skills: { name: string; path: string }[] = []

  try {
    const entries = await readdir(baseDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

      const skillDir = path.join(baseDir, entry.name)
      const skillMdPath = path.join(skillDir, 'SKILL.md')

      try {
        const s = await stat(skillMdPath)
        if (s.isFile()) {
          skills.push({ name: entry.name, path: skillDir })
        }
      } catch {
        // 没有 SKILL.md，跳过
      }
    }
  } catch {
    // 目录不存在，返回空
  }

  return skills
}

// ============================================
// 公共 API
// ============================================

/**
 * 列出用户可用的所有 Skills（预置 + 已安装）
 * 返回轻量 metadata 摘要
 */
export async function listAvailableSkills(userId: string): Promise<SkillSummary[]> {
  // 1. 扫描预置 Skills
  const registrySkills = await scanSkillDirectories(REGISTRY_DIR)

  // 2. 扫描用户 Skills
  const userSkillsDir = getUserSkillsDir(userId)
  const userSkills = await scanSkillDirectories(userSkillsDir)

  // 3. 获取数据库中的用户配置
  const dbRecords = await prisma.userSkill.findMany({
    where: { userId },
  })
  const dbMap = new Map(dbRecords.map(r => [r.skillName, r]))

  // 用户 Skills 名称集合（用于去重：用户安装的覆盖预置的）
  const userSkillNames = new Set<string>()
  const summaries: SkillSummary[] = []

  // 先处理用户 Skills（优先级更高）
  for (const skill of userSkills) {
    try {
      const metadata = await loadSkillMetadata(skill.path)
      const dbRecord = dbMap.get(metadata.name)
      userSkillNames.add(metadata.name)
      summaries.push({
        name: metadata.name,
        description: metadata.description,
        source: dbRecord?.source === 'registry' ? 'registry' : 'custom',
        hasScripts: false,
        isEnabled: dbRecord ? dbRecord.isEnabled : true,
      })
    } catch (err) {
      console.warn(`[SkillRegistry] Failed to load user skill: ${skill.name}`, err)
    }
  }

  // 预置 Skills（跳过已被用户安装的）
  for (const skill of registrySkills) {
    try {
      const metadata = await loadSkillMetadata(skill.path)
      if (userSkillNames.has(metadata.name)) continue // 已被用户安装，跳过
      const dbRecord = dbMap.get(metadata.name)
      summaries.push({
        name: metadata.name,
        description: metadata.description,
        source: 'registry',
        hasScripts: false,
        isEnabled: dbRecord ? dbRecord.isEnabled : false,
      })
    } catch (err) {
      console.warn(`[SkillRegistry] Failed to load registry skill: ${skill.name}`, err)
    }
  }

  return summaries
}

/**
 * 列出用户已启用的 Skills metadata
 */
export async function listEnabledSkills(userId: string): Promise<SkillSummary[]> {
  const all = await listAvailableSkills(userId)
  return all.filter(s => s.isEnabled)
}

/**
 * 按需加载完整 Skill 内容
 */
export async function loadFullSkill(userId: string, skillName: string): Promise<ParsedSkill> {
  // 先从数据库查找已安装的 Skill
  const dbRecord = await prisma.userSkill.findUnique({
    where: { userId_skillName: { userId, skillName } },
  })

  if (dbRecord) {
    return loadSkillFromDirectory(dbRecord.skillPath)
  }

  // 没有安装记录，尝试从预置 registry 加载
  const registryPath = path.join(REGISTRY_DIR, skillName)
  try {
    const s = await stat(path.join(registryPath, 'SKILL.md'))
    if (s.isFile()) {
      return loadSkillFromDirectory(registryPath)
    }
  } catch {
    // 不存在
  }

  // 尝试从用户目录加载（可能是未入库的）
  const userPath = path.join(getUserSkillsDir(userId), skillName)
  try {
    const s = await stat(path.join(userPath, 'SKILL.md'))
    if (s.isFile()) {
      return loadSkillFromDirectory(userPath)
    }
  } catch {
    // 不存在
  }

  throw new Error(`Skill not found: ${skillName}`)
}

/**
 * 从预置 registry 安装 Skill 到用户空间
 */
export async function installFromRegistry(userId: string, skillName: string): Promise<void> {
  const registryPath = path.join(REGISTRY_DIR, skillName)

  try {
    await stat(path.join(registryPath, 'SKILL.md'))
  } catch {
    throw new Error(`Registry skill not found: ${skillName}`)
  }

  // 验证 SKILL.md 合法性
  const metadata = await loadSkillMetadata(registryPath)

  // 复制到用户目录
  const userSkillDir = path.join(getUserSkillsDir(userId), metadata.name)
  await mkdir(userSkillDir, { recursive: true })
  await cp(registryPath, userSkillDir, { recursive: true })

  // 写入数据库
  await prisma.userSkill.upsert({
    where: { userId_skillName: { userId, skillName: metadata.name } },
    update: {
      skillPath: userSkillDir,
      source: 'registry',
      isEnabled: true,
    },
    create: {
      userId,
      skillName: metadata.name,
      skillPath: userSkillDir,
      source: 'registry',
      isEnabled: true,
    },
  })

  console.log(`[SkillRegistry] Installed from registry: ${metadata.name} for user ${userId}`)
}

/**
 * 安装自定义 Skill（从已存在的目录）
 */
export async function installCustomSkill(
  userId: string,
  skillDir: string
): Promise<SkillMetadata> {
  // 验证并解析
  const skill = await loadSkillFromDirectory(skillDir)

  // 复制到用户目录
  const targetDir = path.join(getUserSkillsDir(userId), skill.metadata.name)
  await mkdir(targetDir, { recursive: true })
  await cp(skillDir, targetDir, { recursive: true })

  // 写入数据库
  await prisma.userSkill.upsert({
    where: { userId_skillName: { userId, skillName: skill.metadata.name } },
    update: {
      skillPath: targetDir,
      source: 'custom',
      isEnabled: true,
    },
    create: {
      userId,
      skillName: skill.metadata.name,
      skillPath: targetDir,
      source: 'custom',
      isEnabled: true,
    },
  })

  console.log(`[SkillRegistry] Installed custom skill: ${skill.metadata.name} for user ${userId}`)
  return skill.metadata
}

/**
 * 启用/禁用 Skill
 */
export async function setSkillEnabled(
  userId: string,
  skillName: string,
  enabled: boolean
): Promise<void> {
  await prisma.userSkill.update({
    where: { userId_skillName: { userId, skillName } },
    data: { isEnabled: enabled },
  })
  console.log(`[SkillRegistry] Skill ${skillName} ${enabled ? 'enabled' : 'disabled'} for user ${userId}`)
}

/**
 * 卸载 Skill
 */
export async function uninstallSkill(userId: string, skillName: string): Promise<void> {
  const record = await prisma.userSkill.findUnique({
    where: { userId_skillName: { userId, skillName } },
  })

  if (!record) {
    throw new Error(`Skill not installed: ${skillName}`)
  }

  // 删除文件
  try {
    await rm(record.skillPath, { recursive: true, force: true })
  } catch (err) {
    console.warn(`[SkillRegistry] Failed to remove skill files: ${record.skillPath}`, err)
  }

  // 删除数据库记录
  await prisma.userSkill.delete({
    where: { userId_skillName: { userId, skillName } },
  })

  // 删除所有相关的 assignment
  await prisma.agentSkillAssignment.deleteMany({
    where: { skillName },
  })

  console.log(`[SkillRegistry] Uninstalled skill: ${skillName} for user ${userId}`)
}

// ============================================
// 会话级 Skill 操作
// ============================================

/**
 * 将 Skill 挂载到 session workspace（symlink 方式）
 */
export async function mountSkillToWorkspace(
  swarmSessionId: string,
  userId: string,
  skillName: string
): Promise<string> {
  const skill = await loadFullSkill(userId, skillName)

  // 确保 session workspace 的 _skills/ 目录存在
  const workspaceBase = path.resolve(process.env.SWARM_WORKSPACE_DIR || './session-workspaces')
  const skillsMountDir = path.join(workspaceBase, swarmSessionId, '_skills')
  await mkdir(skillsMountDir, { recursive: true })

  const targetLink = path.join(skillsMountDir, skillName)

  // 创建 symlink（如果已存在则跳过）
  try {
    await stat(targetLink)
    // 已存在，跳过
  } catch {
    await symlink(skill.basePath, targetLink, 'dir')
  }

  const relativePath = `_skills/${skillName}`
  console.log(`[SkillRegistry] Mounted skill ${skillName} to workspace ${swarmSessionId} at ${relativePath}`)

  // 如果 skill 包含本地 Python 包（如 docx_dev），需要安装到虚拟环境
  if (isSkillWithLocalPackage(skillName)) {
    await installSkillLocalPackage(swarmSessionId, skill.basePath)
  }

  return relativePath
}

/**
 * 将 skill 的本地 Python 包安装到会话虚拟环境
 */
async function installSkillLocalPackage(swarmSessionId: string, skillBasePath: string): Promise<void> {
  const scriptsPath = path.join(skillBasePath, 'scripts')

  try {
    // 确保虚拟环境存在
    const venvPath = await ensureSessionVenv(swarmSessionId)
    if (!venvPath) {
      console.warn(`[SkillRegistry] Cannot install local package: venv not available for ${swarmSessionId}`)
      return
    }

    const venvBinPath = getSessionVenvBinPath(swarmSessionId)
    const pythonPath = path.join(venvBinPath, process.platform === 'win32' ? 'python.exe' : 'python')

    // 检查 scripts 目录是否存在
    const scriptsDirExists = await pathExists(scriptsPath)
    if (!scriptsDirExists) {
      console.log(`[SkillRegistry] No scripts dir for local package: ${scriptsPath}`)
      return
    }

    console.log(`[SkillRegistry] Installing local package from ${scriptsPath} to venv...`)

    // 使用 pip install -e 安装本地包
    await execFileAsync(pythonPath, [
      '-m', 'pip', 'install',
      '--quiet',  // 减少日志输出
      '-e', scriptsPath,
    ], {
      timeout: 120000,
    })

    console.log(`[SkillRegistry] Local package installed successfully`)
  } catch (error) {
    console.warn(`[SkillRegistry] Failed to install local package from ${scriptsPath}:`, error)
    // 不抛出错误，symlink 已创建成功，只是包安装失败
  }
}

/**
 * 检查路径是否存在
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * 分配 Skill 给 Teammate 并挂载到 workspace
 */
export async function assignSkillToAgent(
  swarmSessionId: string,
  userId: string,
  agentId: string,
  skillName: string,
  assignedBy: string
): Promise<{ workspacePath: string; instructions: string }> {
  // 验证 Skill 存在且已启用
  const dbRecord = await prisma.userSkill.findUnique({
    where: { userId_skillName: { userId, skillName } },
  })
  if (!dbRecord || !dbRecord.isEnabled) {
    throw new Error(`Skill "${skillName}" is not installed or not enabled`)
  }

  // 创建分配记录
  await prisma.agentSkillAssignment.upsert({
    where: { agentId_skillName: { agentId, skillName } },
    update: {},
    create: {
      agentId,
      skillName,
      assignedBy,
      swarmSessionId,
    },
  })

  // 挂载到 workspace
  const workspacePath = await mountSkillToWorkspace(swarmSessionId, userId, skillName)

  // 加载完整内容
  const skill = await loadFullSkill(userId, skillName)

  console.log(`[SkillRegistry] Assigned skill ${skillName} to agent ${agentId}`)

  return {
    workspacePath,
    instructions: skill.instructions,
  }
}

/**
 * 获取 Agent 已分配的 Skills
 */
export async function getAgentSkillAssignments(
  agentId: string
): Promise<{ skillName: string; assignedBy: string }[]> {
  const assignments = await prisma.agentSkillAssignment.findMany({
    where: { agentId },
    select: { skillName: true, assignedBy: true },
  })
  return assignments
}

/**
 * 获取 Agent 已分配的 Skills 的完整内容
 */
export async function loadAgentSkills(
  agentId: string,
  userId: string
): Promise<{ skill: ParsedSkill; workspacePath: string }[]> {
  const assignments = await getAgentSkillAssignments(agentId)
  const results: { skill: ParsedSkill; workspacePath: string }[] = []

  for (const assignment of assignments) {
    try {
      const skill = await loadFullSkill(userId, assignment.skillName)
      results.push({
        skill,
        workspacePath: `_skills/${assignment.skillName}`,
      })
    } catch (err) {
      console.warn(`[SkillRegistry] Failed to load assigned skill: ${assignment.skillName}`, err)
    }
  }

  return results
}
