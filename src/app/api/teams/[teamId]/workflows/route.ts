import { NextRequest } from 'next/server'
import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team workflow API has been removed from the top-level model.', 410)
}


export async function POST(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team workflow API has been removed from the top-level model.', 410)
}
