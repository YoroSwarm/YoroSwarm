import { successResponse, errorResponse } from '@/lib/api/response'
import { pauseSwarmSession } from '@/lib/server/swarm-session-lifecycle'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await pauseSwarmSession(id)
    return successResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return errorResponse(message, 500)
  }
}
