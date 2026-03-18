/**
 * Skill 上下文注入器
 *
 * 将 Skill 信息注入到 Agent 的 LLM 上下文：
 * - Lead：注入所有已启用 Skills 的 metadata 摘要（name + description）
 * - Teammate：注入被分配 Skills 的完整 instructions + 脚本路径提示
 */

import { listEnabledSkills, loadAgentSkills, mountSkillToWorkspace } from './skill-registry'
import type { SkillSummary, ParsedSkill } from './skill-parser'

// ============================================
// Lead 注入
// ============================================

/**
 * 为 Lead 生成可用 Skills 目录文本
 * 注入到 buildLeadSystemStateMessage 的输出中
 */
export async function buildLeadSkillsSection(userId: string): Promise<string | null> {
  const enabledSkills = await listEnabledSkills(userId)
  if (enabledSkills.length === 0) return null

  const lines: string[] = [
    '## 可用 Skills',
    '以下是你可以分配给 Teammate 的 Skills 列表。使用 assign_skill_to_teammate 工具将 Skill 分配给队友。',
    '分配 Skill 后，队友将获得该 Skill 的详细工作流指令和相关脚本资源。',
    '',
  ]

  for (const skill of enabledSkills) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
  }

  return lines.join('\n')
}

/**
 * 获取 Lead 可见的 Skills 摘要列表（用于 context building）
 */
export async function getLeadSkillSummaries(userId: string): Promise<SkillSummary[]> {
  return listEnabledSkills(userId)
}

// ============================================
// Teammate 注入
// ============================================

/**
 * 为 Teammate 生成已分配 Skills 的完整 instructions 文本
 * 追加到 Teammate system prompt 中
 */
export async function buildTeammateSkillsPromptSection(
  agentId: string,
  userId: string
): Promise<string | null> {
  const assignedSkills = await loadAgentSkills(agentId, userId)
  if (assignedSkills.length === 0) return null

  const sections: string[] = [
    '\n## 已分配的 Skills',
    '以下 Skill 为你提供了额外的工作流指令和脚本工具。请在相关任务中参考使用。',
    '',
  ]

  for (const { skill, workspacePath } of assignedSkills) {
    sections.push(`### Skill: ${skill.metadata.name}`)
    sections.push(skill.instructions)
    sections.push('')

    if (skill.hasScripts && skill.scriptFiles.length > 0) {
      sections.push(`> 📁 此 Skill 的脚本位于 \`${workspacePath}/scripts/\` 目录。`)
      sections.push('> 你可以通过 `read_workspace_file` 读取脚本内容，通过 `shell_exec` 执行脚本。')
      sections.push('')
    }
  }

  return sections.join('\n')
}

/**
 * 确保 Teammate 被分配的 Skills 的脚本已挂载到 workspace
 * 在 Teammate 开始执行前调用
 */
export async function ensureTeammateSkillsMounted(
  agentId: string,
  userId: string,
  swarmSessionId: string
): Promise<void> {
  const assignedSkills = await loadAgentSkills(agentId, userId)
  for (const { skill } of assignedSkills) {
    await mountSkillToWorkspace(swarmSessionId, userId, skill.metadata.name)
  }
}

/**
 * 获取 Teammate 的 Skills 详情（用于外部查询）
 */
export async function getTeammateAssignedSkills(
  agentId: string,
  userId: string
): Promise<{ skill: ParsedSkill; workspacePath: string }[]> {
  return loadAgentSkills(agentId, userId)
}
