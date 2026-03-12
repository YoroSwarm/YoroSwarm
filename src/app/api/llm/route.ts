import { NextRequest } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'

// Simple LLM service interface
interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMRequest {
  messages: LLMMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

// Mock LLM response (replace with actual LLM integration)
async function* mockLLMStream(messages: LLMMessage[]) {
  const lastMessage = messages[messages.length - 1]
  const response = `I received your message: "${lastMessage?.content || 'No content'}". This is a mock response from the LLM service.`
  
  // Simulate streaming by yielding chunks
  const words = response.split(' ')
  for (const word of words) {
    await new Promise(resolve => setTimeout(resolve, 50))
    yield word + ' '
  }
}

async function mockLLMComplete(messages: LLMMessage[]): Promise<string> {
  const lastMessage = messages[messages.length - 1]
  return `I received your message: "${lastMessage?.content || 'No content'}". This is a mock response from the LLM service.`
}

// POST - Send message to LLM
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    try {
      verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body: LLMRequest = await request.json()
    const { messages, stream = false } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('Messages array is required', 400)
    }

    // For streaming responses
    if (stream) {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of mockLLMStream(messages)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // For non-streaming responses
    const response = await mockLLMComplete(messages)

    return successResponse({
      content: response,
      model: 'mock-llm',
      usage: {
        prompt_tokens: JSON.stringify(messages).length,
        completion_tokens: response.length,
        total_tokens: JSON.stringify(messages).length + response.length,
      },
    })
  } catch (error) {
    console.error('LLM request error:', error)
    return errorResponse('Internal server error', 500)
  }
}
