import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ workflowId: string }>
}

export async function POST(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy workflow control API has been removed from the top-level model.', 410)
}
