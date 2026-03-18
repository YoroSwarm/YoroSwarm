import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import {
  listAvailableSkills,
  loadFullSkill,
  installFromRegistry,
  setSkillEnabled,
  uninstallSkill,
} from '@/lib/server/skills/skill-registry'

/**
 * GET /api/skills — 列出用户可用的所有 Skills
 */
export async function GET() {
  try {
    const payload = await requireTokenPayload()
    const skills = await listAvailableSkills(payload.userId)
    return successResponse(skills)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API /api/skills] GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/skills — 安装 Skill
 * body: { action: 'install-from-registry', skillName: string }
 *     | { action: 'toggle', skillName: string, enabled: boolean }
 *     | { action: 'uninstall', skillName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'install-from-registry': {
        const { skillName } = body
        if (!skillName || typeof skillName !== 'string') {
          return errorResponse('skillName is required')
        }
        await installFromRegistry(payload.userId, skillName)
        return successResponse({ installed: true, skillName })
      }

      case 'toggle': {
        const { skillName, enabled } = body
        if (!skillName || typeof skillName !== 'string') {
          return errorResponse('skillName is required')
        }
        if (typeof enabled !== 'boolean') {
          return errorResponse('enabled must be a boolean')
        }
        await setSkillEnabled(payload.userId, skillName, enabled)
        return successResponse({ skillName, enabled })
      }

      case 'uninstall': {
        const { skillName } = body
        if (!skillName || typeof skillName !== 'string') {
          return errorResponse('skillName is required')
        }
        await uninstallSkill(payload.userId, skillName)
        return successResponse({ uninstalled: true, skillName })
      }

      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[API /api/skills] POST error:', error)
    return errorResponse(message, 500)
  }
}
