import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import { loadFullSkill } from '@/lib/server/skills/skill-registry'

/**
 * GET /api/skills/[name] — 获取 Skill 完整详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const payload = await requireTokenPayload()
    const { name } = await params
    const skill = await loadFullSkill(payload.userId, name)

    return successResponse({
      name: skill.metadata.name,
      description: skill.metadata.description,
      license: skill.metadata.license,
      allowedTools: skill.metadata.allowedTools,
      compatibility: skill.metadata.compatibility,
      metadata: skill.metadata.metadata,
      instructions: skill.instructions,
      hasScripts: skill.hasScripts,
      scriptFiles: skill.scriptFiles,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    if (error instanceof Error && error.message.startsWith('Skill not found')) {
      return errorResponse('Skill not found', 404)
    }
    console.error('[API /api/skills/[name]] GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
