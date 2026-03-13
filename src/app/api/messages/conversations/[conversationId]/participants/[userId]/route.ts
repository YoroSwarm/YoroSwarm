import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ conversationId: string; userId: string }>
}

export async function POST(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy participant API has been removed. External chat participants are fixed to user <-> lead per swarm session.', 410)
}

export async function DELETE(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy participant API has been removed. External chat participants are fixed to user <-> lead per swarm session.', 410)
}
