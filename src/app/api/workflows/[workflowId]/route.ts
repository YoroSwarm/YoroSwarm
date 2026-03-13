import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ workflowId: string }>
}

export async function GET(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy workflow API has been removed from the top-level model.', 410)
}

export async function PUT(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy workflow API has been removed from the top-level model.', 410)
}

export async function DELETE(_request: Request, _context: RouteContext) {
  return errorResponse('Legacy workflow API has been removed from the top-level model.', 410)
}
