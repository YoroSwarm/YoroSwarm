import prisma from '@/lib/db'

export interface LeadPreferences {
  agentsMd?: string | null
  soulMd?: string | null
}

/**
 * 获取用户 Lead 配置
 * 从数据库读取用户的自定义配置
 * 如果用户没有自定义配置，返回 { agentsMd: null, soulMd: null }
 */
export async function getLeadPreferences(userId: string): Promise<LeadPreferences> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        leadAgentsMd: true,
        leadSoulMd: true,
      },
    })

    if (!user) {
      console.log('[LeadPreferences] User not found, returning null preferences')
      return { agentsMd: null, soulMd: null }
    }

    // 检查是否有自定义配置（非 null 且非空字符串）
    const hasCustomAgents = user.leadAgentsMd && user.leadAgentsMd.trim().length > 0
    const hasCustomSoul = user.leadSoulMd && user.leadSoulMd.trim().length > 0

    console.log('[LeadPreferences] 从数据库读取:', {
      userId,
      leadAgentsMd: user.leadAgentsMd?.substring(0, 50),
      leadSoulMd: user.leadSoulMd?.substring(0, 50),
      hasCustomAgents,
      hasCustomSoul,
    })

    // 只有当至少有一个自定义配置时才返回
    if (hasCustomAgents || hasCustomSoul) {
      const result = {
        agentsMd: hasCustomAgents ? user.leadAgentsMd! : null,
        soulMd: hasCustomSoul ? user.leadSoulMd! : null,
      }
      console.log('[LeadPreferences] 返回配置:', {
        agentsMd: result.agentsMd?.substring(0, 50),
        soulMd: result.soulMd?.substring(0, 50),
      })
      return result
    }

    // 没有自定义配置
    console.log('[LeadPreferences] 无自定义配置，返回 null')
    return { agentsMd: null, soulMd: null }
  } catch (error) {
    console.error('[LeadPreferences] Failed to load from database:', error)
    return { agentsMd: null, soulMd: null }
  }
}
