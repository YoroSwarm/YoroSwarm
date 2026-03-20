/**
 * 命令风险分类引擎
 * 将 shell 命令分为 low / medium / high / critical 四级风险
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface RiskAssessment {
  level: RiskLevel
  reason: string
  /** 用于会话规则匹配的命令类别标签，如 "file_read", "package_install" */
  category: string
  /** 匹配到的主命令（第一个 token） */
  primaryCommand: string
}

// ── Critical: 强制审批，不可自动放行 ──

const CRITICAL_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  { pattern: /\bsudo\b/, reason: '使用 sudo 提权', category: 'privilege_escalation' },
  { pattern: /\bmkfs\b/, reason: '格式化文件系统', category: 'destructive_system' },
  { pattern: /\bdd\b\s+.*\bof=/, reason: '低级磁盘写入 (dd)', category: 'destructive_system' },
  { pattern: />\s*\/dev\//, reason: '直接写入设备文件', category: 'destructive_system' },
  { pattern: /\brm\s+(-[^\s]*)?-r[^\s]*\s+\/\s*$/, reason: '递归删除根目录', category: 'destructive_system' },
  { pattern: /\brm\s+(-[^\s]*)?-rf?\s+\/\s*$/, reason: '强制删除根目录', category: 'destructive_system' },
  { pattern: /:(){ :\|:& };:/, reason: 'Fork bomb', category: 'destructive_system' },
  { pattern: /\bshutdown\b|\breboot\b|\binit\s+[06]\b/, reason: '系统关机/重启', category: 'destructive_system' },
  { pattern: /\bsystemctl\s+(stop|disable|mask)\b/, reason: '停止系统服务', category: 'destructive_system' },
]

// ── High: 需要审批 + 高风险警告 ──

const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  { pattern: /\brm\s/, reason: '删除文件/目录', category: 'file_delete' },
  { pattern: /\bchmod\b/, reason: '修改文件权限', category: 'permission_change' },
  { pattern: /\bchown\b/, reason: '修改文件所有者', category: 'permission_change' },
  { pattern: /\bcurl\b.*\|\s*(sh|bash|zsh)\b/, reason: '从网络下载并执行脚本', category: 'remote_exec' },
  { pattern: /\bwget\b.*\|\s*(sh|bash|zsh)\b/, reason: '从网络下载并执行脚本', category: 'remote_exec' },
  { pattern: /\beval\b/, reason: '动态代码执行 (eval)', category: 'dynamic_exec' },
  { pattern: /\bkill\b/, reason: '终止进程', category: 'process_control' },
  { pattern: /\bkillall\b/, reason: '批量终止进程', category: 'process_control' },
  { pattern: /\bpkill\b/, reason: '按名称终止进程', category: 'process_control' },
  { pattern: />\s*[^|]/, reason: '文件覆盖重定向', category: 'file_write' },
  { pattern: /\bmv\s/, reason: '移动/重命名文件', category: 'file_move' },
  { pattern: /\bnpm\s+publish\b/, reason: '发布 npm 包', category: 'publish' },
  { pattern: /\bgit\s+push\b/, reason: 'Git push', category: 'git_push' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'Git 硬重置', category: 'git_destructive' },
  { pattern: /\bgit\s+clean\s+-[^\s]*f/, reason: 'Git 强制清理', category: 'git_destructive' },
  { pattern: /\bdocker\s+(rm|rmi|system\s+prune)\b/, reason: 'Docker 删除操作', category: 'docker_destructive' },
]

// ── Low: 安全的只读/信息查询命令 ──

const LOW_RISK_COMMANDS = new Set([
  'ls', 'dir', 'cat', 'echo', 'pwd', 'wc', 'head', 'tail', 'date',
  'whoami', 'hostname', 'uname', 'which', 'where', 'type', 'file',
  'stat', 'du', 'df', 'free', 'uptime', 'env', 'printenv', 'set',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'find', 'fd',
  'tree', 'less', 'more', 'sort', 'uniq', 'cut', 'tr', 'awk', 'sed',
  'diff', 'comm', 'tee', 'xargs', 'basename', 'dirname', 'realpath',
  'true', 'false', 'test', 'expr', 'seq', 'printf',
  // 开发工具（只读）
  'git', 'node', 'python', 'python3', 'ruby', 'java', 'go',
  'tsc', 'npx', 'pnpm', 'yarn', 'bun', 'deno',
  'cargo', 'rustc', 'gcc', 'g++', 'clang', 'make',
])

// git 子命令中安全的只读命令
const LOW_RISK_GIT_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'tag', 'remote',
  'stash', 'describe', 'shortlog', 'blame', 'ls-files', 'ls-tree',
  'rev-parse', 'rev-list', 'config',
])

// 命令前缀 → 中风险类别映射
const MEDIUM_RISK_COMMANDS: Record<string, { reason: string; category: string }> = {
  'npm': { reason: '包管理器操作', category: 'package_manager' },
  'yarn': { reason: '包管理器操作', category: 'package_manager' },
  'pnpm': { reason: '包管理器操作', category: 'package_manager' },
  'pip': { reason: 'Python 包管理', category: 'package_manager' },
  'pip3': { reason: 'Python 包管理', category: 'package_manager' },
  'brew': { reason: 'Homebrew 操作', category: 'package_manager' },
  'apt': { reason: '系统包管理', category: 'package_manager' },
  'apt-get': { reason: '系统包管理', category: 'package_manager' },
  'curl': { reason: '网络请求', category: 'network' },
  'wget': { reason: '网络下载', category: 'network' },
  'docker': { reason: 'Docker 操作', category: 'docker' },
  'docker-compose': { reason: 'Docker Compose 操作', category: 'docker' },
  'cp': { reason: '复制文件', category: 'file_copy' },
  'mkdir': { reason: '创建目录', category: 'file_create' },
  'touch': { reason: '创建文件', category: 'file_create' },
  'tar': { reason: '归档操作', category: 'archive' },
  'zip': { reason: '压缩操作', category: 'archive' },
  'unzip': { reason: '解压操作', category: 'archive' },
}

/**
 * 从复合命令字符串中提取第一个有意义的命令 token
 */
function extractPrimaryCommand(command: string): string {
  const trimmed = command.trim()
  // 跳过环境变量赋值前缀 (如 FOO=bar cmd)
  const withoutEnvPrefix = trimmed.replace(/^(\w+=\S+\s+)+/, '')
  // 取第一个 token
  const first = withoutEnvPrefix.split(/\s+/)[0] || ''
  // 去掉路径前缀
  return first.split('/').pop() || first
}

/**
 * 提取 git 子命令
 */
function extractGitSubcommand(command: string): string | null {
  const match = command.match(/\bgit\s+([a-z][\w-]*)/)
  return match ? match[1] : null
}

/**
 * 评估命令风险等级
 */
export function assessCommandRisk(command: string): RiskAssessment {
  const primaryCommand = extractPrimaryCommand(command)

  // 1. 检查 Critical 级别
  for (const rule of CRITICAL_PATTERNS) {
    if (rule.pattern.test(command)) {
      return {
        level: 'critical',
        reason: rule.reason,
        category: rule.category,
        primaryCommand,
      }
    }
  }

  // 2. 检查 High 级别
  for (const rule of HIGH_RISK_PATTERNS) {
    if (rule.pattern.test(command)) {
      return {
        level: 'high',
        reason: rule.reason,
        category: rule.category,
        primaryCommand,
      }
    }
  }

  // 3. 检查管道/链式命令中是否含有高风险部分
  // 支持 |, ||, &&, &(后台), ;, 以及换行符分隔的复合命令
  // 注意：&&/|| 需在 &/| 之前匹配（regex 左优先）
  const pipeSegments = command.split(/\|{1,2}|&&|&|;|\n/).map(s => s.trim()).filter(Boolean)
  if (pipeSegments.length > 1) {
    let highestRisk: RiskAssessment | null = null
    for (const segment of pipeSegments) {
      const segAssessment = assessSingleCommand(segment)
      if (segAssessment.level === 'critical') {
        return { ...segAssessment, primaryCommand }
      }
      if (segAssessment.level === 'high' && (!highestRisk || highestRisk.level !== 'high')) {
        highestRisk = { ...segAssessment, primaryCommand }
      }
    }
    if (highestRisk) return highestRisk
  }

  // 4. 单命令评估
  return assessSingleCommand(command)
}

function assessSingleCommand(command: string): RiskAssessment {
  const primaryCommand = extractPrimaryCommand(command)

  // git 特殊处理：根据子命令决定
  if (primaryCommand === 'git') {
    const subcommand = extractGitSubcommand(command)
    if (subcommand && LOW_RISK_GIT_SUBCOMMANDS.has(subcommand)) {
      return {
        level: 'low',
        reason: `Git 只读操作 (${subcommand})`,
        category: 'git_read',
        primaryCommand,
      }
    }
    return {
      level: 'medium',
      reason: `Git 写入操作 (${subcommand || 'unknown'})`,
      category: 'git_write',
      primaryCommand,
    }
  }

  // node/python 等 — 运行脚本为 medium
  if (['node', 'python', 'python3', 'ruby', 'deno', 'bun'].includes(primaryCommand)) {
    // --version, --help 等为 low
    if (/\s+--?(version|help|v|h)\b/.test(command) || command.trim() === primaryCommand) {
      return {
        level: 'low',
        reason: `${primaryCommand} 信息查询`,
        category: 'info_query',
        primaryCommand,
      }
    }
    return {
      level: 'medium',
      reason: `执行 ${primaryCommand} 脚本`,
      category: 'script_exec',
      primaryCommand,
    }
  }

  // Low risk
  if (LOW_RISK_COMMANDS.has(primaryCommand)) {
    return {
      level: 'low',
      reason: '只读/信息查询命令',
      category: 'info_query',
      primaryCommand,
    }
  }

  // Medium risk (已知的中风险命令)
  const mediumRule = MEDIUM_RISK_COMMANDS[primaryCommand]
  if (mediumRule) {
    return {
      level: 'medium',
      reason: mediumRule.reason,
      category: mediumRule.category,
      primaryCommand,
    }
  }

  // 默认: medium
  return {
    level: 'medium',
    reason: '未知命令，需要审批',
    category: 'unknown',
    primaryCommand,
  }
}

/**
 * 风险等级的显示配置
 */
export const RISK_LEVEL_CONFIG: Record<RiskLevel, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  description: string
}> = {
  low: {
    label: '低风险',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    description: '只读命令，安全',
  },
  medium: {
    label: '中风险',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    description: '可能修改文件或安装包',
  },
  high: {
    label: '高风险',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: '可能造成不可逆变更',
  },
  critical: {
    label: '危险',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    description: '极高风险操作，强制审批',
  },
}
