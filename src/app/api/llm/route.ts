import { NextRequest } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { callLLM, extractTextContent } from '@/lib/server/llm/client'

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
    const { messages, model, temperature, maxTokens, stream = false } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('Messages array is required', 400)
    }

    // Extract system message if present
    const systemMessages = messages.filter(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    const systemPrompt = systemMessages.map(m => m.content).join('\n') || 'You are a helpful assistant.'

    // Convert to Anthropic message format
    const anthropicMessages = nonSystemMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Ensure first message is from user
    if (anthropicMessages.length === 0 || anthropicMessages[0].role !== 'user') {
      anthropicMessages.unshift({ role: 'user', content: '你好' })
    }

    if (stream) {
      // For streaming, use a simple approach
      const response = await callLLM({
        systemPrompt,
        messages: anthropicMessages,
        model,
        maxTokens,
        temperature,
      })

      const text = extractTextContent(response)
      const encoder = new TextEncoder()
      const words = text.split(' ')

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for (const word of words) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`))
              await new Promise(resolve => setTimeout(resolve, 20))
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

    // Non-streaming
    const response = await callLLM({
      systemPrompt,
      messages: anthropicMessages,
      model,
      maxTokens,
      temperature,
    })

    const content = extractTextContent(response)

    return successResponse({
      content,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.inputTokens,
        completion_tokens: response.usage.outputTokens,
        total_tokens: response.usage.inputTokens + response.usage.outputTokens,
      },
    })
  } catch (error) {
    console.error('LLM request error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
