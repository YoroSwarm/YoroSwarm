import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ messageId: string }>
}

export async function PUT(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy message read API has been removed. External chat is now scoped to /api/swarm-sessions/:id/external/messages.', 410)
}
