import { NextRequest } from 'next/server'
import { errorResponse } from '@/lib/api/response'

type RouteContext = {
  params: Promise<{ teamId: string }>
}

export async function POST(_request: NextRequest, _context: RouteContext) {
  return errorResponse('Legacy team agent API has been removed. Use /api/agents with swarmSessionId instead.', 410)
}
