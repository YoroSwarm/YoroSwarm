import { errorResponse } from '@/lib/api/response'

export async function GET() {
  return errorResponse('Legacy team API has been removed. Use /api/swarm-sessions as the top-level resource.', 410)
}

export async function POST() {
  return errorResponse('Legacy team API has been removed. Use /api/swarm-sessions to create a new work session.', 410)
}
