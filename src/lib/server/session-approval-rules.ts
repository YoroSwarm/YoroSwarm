/**
 * 会话级审批规则管理
 * 使用内存存储，仅当前会话有效，服务器重启后清空
 */

import { assessCommandRisk, type RiskLevel } from './command-risk'

export type ApprovalAction = 'auto_approve' | 'always_reject' | 'require_approval'

export interface ApprovalRule {
  id: string
  /** 规则类型：按命令前缀、正则、风险等级、命令类别 */
  matchType: 'prefix' | 'regex' | 'risk_level' | 'category'
  /** 匹配值：命令前缀字符串、正则表达式字符串、风险等级、类别名 */
  matchValue: string
  /** 匹配到后的行为 */
  action: ApprovalAction
  /** 规则来源 */
  source: 'builtin' | 'user' | 'inline'
  /** 创建时间 */
  createdAt: string
  /** 可读描述 */
  description?: string
}

export interface ApprovalDecision {
  action: ApprovalAction
  matchedRule: ApprovalRule | null
  riskLevel: RiskLevel
  riskReason: string
  riskCategory: string
}

// 会话级规则存储：sessionId -> rules[]
const sessionRules = new Map<string, ApprovalRule[]>()

// 内置默认规则（低风险自动放行）
const BUILTIN_RULES: ApprovalRule[] = [
  {
    id: 'builtin-low-auto',
    matchType: 'risk_level',
    matchValue: 'low',
    action: 'auto_approve',
    source: 'builtin',
    createdAt: new Date().toISOString(),
    description: '低风险命令自动放行',
  },
]

/**
 * 获取会话的所有规则（内置 + 用户自定义）
 */
export function getSessionRules(sessionId: string): ApprovalRule[] {
  const userRules = sessionRules.get(sessionId) || []
  return [...userRules, ...BUILTIN_RULES]
}

/**
 * 仅获取用户自定义规则
 */
export function getUserSessionRules(sessionId: string): ApprovalRule[] {
  return sessionRules.get(sessionId) || []
}

/**
 * 添加会话规则
 */
export function addSessionRule(sessionId: string, rule: Omit<ApprovalRule, 'id' | 'createdAt'>): ApprovalRule {
  const fullRule: ApprovalRule = {
    ...rule,
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }

  const existing = sessionRules.get(sessionId) || []

  // 去重：相同 matchType + matchValue 的规则覆盖旧的
  const filtered = existing.filter(
    r => !(r.matchType === fullRule.matchType && r.matchValue === fullRule.matchValue)
  )
  filtered.push(fullRule)
  sessionRules.set(sessionId, filtered)

  return fullRule
}

/**
 * 删除会话规则
 */
export function removeSessionRule(sessionId: string, ruleId: string): boolean {
  const existing = sessionRules.get(sessionId)
  if (!existing) return false

  const filtered = existing.filter(r => r.id !== ruleId)
  if (filtered.length === existing.length) return false

  sessionRules.set(sessionId, filtered)
  return true
}

/**
 * 清空会话的所有用户规则
 */
export function clearSessionRules(sessionId: string): void {
  sessionRules.delete(sessionId)
}

/**
 * 判断命令是否匹配规则
 */
function matchesRule(rule: ApprovalRule, command: string, riskLevel: RiskLevel, category: string): boolean {
  switch (rule.matchType) {
    case 'prefix': {
      const primaryCmd = command.trim().split(/\s+/)[0] || ''
      return primaryCmd.startsWith(rule.matchValue)
    }
    case 'regex': {
      try {
        return new RegExp(rule.matchValue).test(command)
      } catch {
        return false
      }
    }
    case 'risk_level':
      return riskLevel === rule.matchValue
    case 'category':
      return category === rule.matchValue
    default:
      return false
  }
}

/**
 * 评估命令的审批决策
 * 返回最终决策（自动放行 / 需审批 / 拒绝）
 */
export function evaluateApproval(sessionId: string, command: string): ApprovalDecision {
  const risk = assessCommandRisk(command)

  // Critical 级别始终需要审批，不可被规则覆盖
  if (risk.level === 'critical') {
    return {
      action: 'require_approval',
      matchedRule: null,
      riskLevel: risk.level,
      riskReason: risk.reason,
      riskCategory: risk.category,
    }
  }

  const rules = getSessionRules(sessionId)

  // 用户规则优先于内置规则（先添加的用户规则在前面，但用户规则整体优先于 builtin）
  // 按优先级排序：user/inline > builtin
  const sortedRules = [...rules].sort((a, b) => {
    const priority = { user: 0, inline: 0, builtin: 1 }
    return (priority[a.source] ?? 1) - (priority[b.source] ?? 1)
  })

  for (const rule of sortedRules) {
    if (matchesRule(rule, command, risk.level, risk.category)) {
      return {
        action: rule.action,
        matchedRule: rule,
        riskLevel: risk.level,
        riskReason: risk.reason,
        riskCategory: risk.category,
      }
    }
  }

  // 无规则匹配：默认需要审批
  return {
    action: 'require_approval',
    matchedRule: null,
    riskLevel: risk.level,
    riskReason: risk.reason,
    riskCategory: risk.category,
  }
}

/**
 * 快捷方法：从审批卡片上的 "本会话总是允许" 创建 inline 规则
 */
export function addInlineAutoApproveRule(
  sessionId: string,
  category: string,
  description: string
): ApprovalRule {
  return addSessionRule(sessionId, {
    matchType: 'category',
    matchValue: category,
    action: 'auto_approve',
    source: 'inline',
    description,
  })
}

/**
 * 获取会话统计
 */
export function getSessionApprovalStats(sessionId: string): {
  totalRules: number
  userRules: number
  builtinRules: number
} {
  const userRules = sessionRules.get(sessionId) || []
  return {
    totalRules: userRules.length + BUILTIN_RULES.length,
    userRules: userRules.length,
    builtinRules: BUILTIN_RULES.length,
  }
}
