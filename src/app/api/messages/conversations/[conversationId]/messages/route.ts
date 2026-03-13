import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ conversationId: string }>
}

export async function GET(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy conversation API has been removed. Use /api/swarm-sessions/:id/external/messages instead.', 410)
}
