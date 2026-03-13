import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy team member API has been removed. Use /api/agents?swarmSessionId={id} instead.', 410)
}
