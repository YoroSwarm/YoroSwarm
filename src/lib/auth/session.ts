import { cookies } from 'next/headers'
import { verifyAccessToken } from './jwt'
import prisma from '@/lib/db'

export interface SessionUser {
  id: string
  username: string
  email: string
  isActive: boolean
  isSuperuser: boolean
}

export interface Session {
  user: SessionUser
  sessionId: string
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return null
    }

    const payload = verifyAccessToken(token)
    
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        isSuperuser: true,
      },
    })

    if (!user || !user.isActive) {
      return null
    }

    return {
      user,
      sessionId: payload.sessionId,
    }
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<Session> {
  const session = await getSession()
  
  if (!session) {
    throw new Error('Authentication required')
  }
  
  return session
}

export async function requireSuperuser(): Promise<Session> {
  const session = await requireAuth()
  
  if (!session.user.isSuperuser) {
    throw new Error('Superuser access required')
  }
  
  return session
}
