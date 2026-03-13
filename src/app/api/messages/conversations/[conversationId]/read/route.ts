import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ conversationId: string }>
}

export async function PUT(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy conversation read API has been removed. External session chat no longer uses generic conversation read state.', 410)
}
