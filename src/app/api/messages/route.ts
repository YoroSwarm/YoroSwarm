import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response'
import { cookies } from 'next/headers'
import { MessageType } from '@prisma/client'

// GET - List messages
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: payload.userId },
          { recipientId: payload.userId },
          ...(conversationId ? [{ conversationId }] : []),
        ],
      },
      include: {
        sender: {
          select: { id: true, username: true, email: true },
        },
        recipient: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })

    return successResponse(messages)
  } catch (error) {
    console.error('List messages error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Send a new message
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return unauthorizedResponse('Authentication required')
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return unauthorizedResponse('Invalid token')
    }

    const body = await request.json()
    const { recipientId, conversationId, content, type = MessageType.TEXT, metadata } = body

    if (!content) {
      return errorResponse('Message content is required', 400)
    }

    const message = await prisma.message.create({
      data: {
        senderId: payload.userId,
        recipientId,
        conversationId,
        content,
        type,
        metadata: metadata ? JSON.stringify(metadata) : null,
        status: 'SENT',
      },
      include: {
        sender: {
          select: { id: true, username: true, email: true },
        },
        recipient: {
          select: { id: true, username: true, email: true },
        },
      },
    })

    return successResponse(message, 'Message sent successfully')
  } catch (error) {
    console.error('Send message error:', error)
    return errorResponse('Internal server error', 500)
  }
}
