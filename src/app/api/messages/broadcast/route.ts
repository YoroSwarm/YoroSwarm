import { errorResponse } from '@/lib/api/response'

export async function GET() {
  return errorResponse('Legacy broadcast message API has been removed from the main workflow.', 410)
}

export async function POST() {
  return errorResponse('Legacy broadcast message API has been removed from the main workflow.', 410)
}
