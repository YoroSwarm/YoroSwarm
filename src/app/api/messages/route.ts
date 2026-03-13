import { errorResponse } from '@/lib/api/response'

export async function GET() {
  return errorResponse('Generic message API has been removed from the main workflow. Use /api/swarm-sessions/:id/external/messages.', 410)
}

export async function POST() {
  return errorResponse('Generic message API has been removed from the main workflow. Use /api/swarm-sessions/:id/external/messages.', 410)
}
