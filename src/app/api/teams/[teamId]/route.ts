import { NextRequest } from 'next/server'
import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function GET(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team API has been removed. Use /api/swarm-sessions/:id instead.', 410)
}

export async function PUT(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team API has been removed. Update the corresponding swarm session instead.', 410)
}

export async function DELETE(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team API has been removed. Archive the corresponding swarm session instead.', 410)
}
