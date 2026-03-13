import { successResponse } from '@/lib/api/response'

export async function GET() {
  return successResponse({
    total_unread: 0,
    conversation_unread: {},
  })
}
