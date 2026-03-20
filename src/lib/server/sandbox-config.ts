/**
 * 会话级沙盒策略配置
 * 内存存储，与 session-approval-rules 同一模式
 */

import { type SandboxPolicy, getSandboxStatus } from './sandbox-exec'

export interface SessionSandboxConfig {
  /** 当前生效的沙盒策略（仅影响默认策略，网络命令仍自动切换为 net 策略） */
  defaultPolicy: SandboxPolicy
  /** 是否允许网络命令自动升级策略 */
  autoNetworkUpgrade: boolean
  /** 自定义可写根目录（追加到工作区之外） */
  extraWritableRoots: string[]
  /** 最后修改时间 */
  updatedAt: string
}

// 会话级配置存储
const sessionConfigs = new Map<string, SessionSandboxConfig>()

const DEFAULT_CONFIG: Readonly<SessionSandboxConfig> = {
  defaultPolicy: 'workspace-write',
  autoNetworkUpgrade: true,
  extraWritableRoots: [],
  updatedAt: new Date().toISOString(),
}

/**
 * 获取会话的沙盒配置（不存在则返回默认值）
 */
export function getSessionSandboxConfig(sessionId: string): SessionSandboxConfig {
  return sessionConfigs.get(sessionId) || { ...DEFAULT_CONFIG }
}

/**
 * 更新会话的沙盒配置（部分更新）
 */
export function updateSessionSandboxConfig(
  sessionId: string,
  patch: Partial<Pick<SessionSandboxConfig, 'defaultPolicy' | 'autoNetworkUpgrade' | 'extraWritableRoots'>>
): SessionSandboxConfig {
  const current = getSessionSandboxConfig(sessionId)
  const updated: SessionSandboxConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  // Validate policy
  const validPolicies: SandboxPolicy[] = ['workspace-write', 'workspace-write-net', 'read-only', 'disabled']
  if (!validPolicies.includes(updated.defaultPolicy)) {
    throw new Error(`Invalid policy: ${updated.defaultPolicy}`)
  }

  // Validate extraWritableRoots (no relative paths)
  for (const root of updated.extraWritableRoots) {
    if (!root.startsWith('/')) {
      throw new Error(`Extra writable root must be absolute path: ${root}`)
    }
  }

  sessionConfigs.set(sessionId, updated)
  return updated
}

/**
 * 重置会话沙盒配置为默认值
 */
export function resetSessionSandboxConfig(sessionId: string): void {
  sessionConfigs.delete(sessionId)
}

/**
 * 解析最终沙盒策略：结合会话配置 + 命令特征
 */
export function resolveEffectivePolicy(
  sessionId: string,
  commandNeedsNetwork: boolean
): SandboxPolicy {
  const config = getSessionSandboxConfig(sessionId)

  // disabled 优先级最高 — 用户明确关闭沙盒
  if (config.defaultPolicy === 'disabled') {
    return 'disabled'
  }

  // 网络命令自动升级
  if (commandNeedsNetwork && config.autoNetworkUpgrade) {
    if (config.defaultPolicy === 'read-only' || config.defaultPolicy === 'workspace-write') {
      return 'workspace-write-net'
    }
  }

  return config.defaultPolicy
}

/**
 * 获取完整的沙盒状态信息（用于 API 返回）
 */
export function getFullSandboxStatus(sessionId: string) {
  const platformStatus = getSandboxStatus()
  const sessionConfig = getSessionSandboxConfig(sessionId)

  return {
    platform: platformStatus,
    session: sessionConfig,
    effective: {
      sandboxActive: platformStatus.available && sessionConfig.defaultPolicy !== 'disabled',
      reason: !platformStatus.available
        ? `Sandbox unavailable: ${platformStatus.reason}`
        : sessionConfig.defaultPolicy === 'disabled'
          ? 'Sandbox disabled by session config'
          : `Active (${platformStatus.tool}, policy: ${sessionConfig.defaultPolicy})`,
    },
  }
}
