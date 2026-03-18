import { NextRequest } from 'next/server'
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api/response'
import { requireTokenPayload } from '@/lib/server/swarm'
import prisma from '@/lib/db'

/**
 * GET /api/env-vars — 获取用户环境变量（值已脱敏）
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { envVarsJson: true },
    })

    const envVars: Record<string, string> = user?.envVarsJson
      ? JSON.parse(user.envVarsJson)
      : {}

    // If ?reveal=KEY is specified, return the actual value for that key
    const revealKey = request.nextUrl.searchParams.get('reveal')
    if (revealKey) {
      if (!(revealKey in envVars)) {
        return errorResponse('Variable not found', 404)
      }
      return successResponse({ key: revealKey, value: envVars[revealKey] })
    }

    // Default: return masked values
    const masked = Object.fromEntries(
      Object.entries(envVars).map(([key, value]) => [
        key,
        value.length > 4
          ? value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 20)) + value.slice(-2)
          : '****',
      ])
    )

    return successResponse({ variables: masked, count: Object.keys(envVars).length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API /api/env-vars] GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/env-vars — 管理环境变量
 * body: { action: 'set', key: string, value: string }
 *     | { action: 'delete', key: string }
 *     | { action: 'set-all', variables: Record<string, string> }
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await requireTokenPayload()
    const body = await request.json()
    const { action } = body

    // 加载当前环境变量
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { envVarsJson: true },
    })
    const envVars: Record<string, string> = user?.envVarsJson
      ? JSON.parse(user.envVarsJson)
      : {}

    switch (action) {
      case 'set': {
        const { key, value } = body
        if (!key || typeof key !== 'string') return errorResponse('key is required')
        if (typeof value !== 'string') return errorResponse('value must be a string')
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          return errorResponse('Invalid variable name. Use letters, digits, and underscores only.')
        }
        envVars[key] = value
        break
      }

      case 'delete': {
        const { key } = body
        if (!key || typeof key !== 'string') return errorResponse('key is required')
        delete envVars[key]
        break
      }

      case 'set-all': {
        const { variables } = body
        if (!variables || typeof variables !== 'object') {
          return errorResponse('variables must be an object')
        }
        // Replace all
        const newVars = variables as Record<string, string>
        for (const [k, v] of Object.entries(newVars)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
            return errorResponse(`Invalid variable name: ${k}`)
          }
          if (typeof v !== 'string') {
            return errorResponse(`Value for ${k} must be a string`)
          }
        }
        // Clear and set
        Object.keys(envVars).forEach(k => delete envVars[k])
        Object.assign(envVars, newVars)
        break
      }

      default:
        return errorResponse(`Unknown action: ${action}`)
    }

    // Save
    await prisma.user.update({
      where: { id: payload.userId },
      data: { envVarsJson: JSON.stringify(envVars) },
    })

    return successResponse({ count: Object.keys(envVars).length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('[API /api/env-vars] POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}
