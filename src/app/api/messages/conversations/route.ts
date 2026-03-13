import { errorResponse } from '@/lib/api/response'

export async function GET() {
  return errorResponse('Legacy conversation API has been removed. Use /api/swarm-sessions and /api/swarm-sessions/:id/external/messages instead.', 410)
}

export async function POST() {
  return errorResponse('Legacy conversation API has been removed. Users now only talk to the session lead via /api/swarm-sessions/:id/external/messages.', 410)
}
