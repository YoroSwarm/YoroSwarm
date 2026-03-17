import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'

const agentContextWriteQueues = new Map<string, Promise<unknown>>()

type AppendAgentContextEntryInput = {
  swarmSessionId: string
  agentId: string
  sourceType: string
  sourceId?: string | null
  entryType: string
  content: string
  metadata?: Record<string, unknown> | null
  visibility?: string
}

export async function appendAgentContextEntry(input: AppendAgentContextEntryInput) {
  const queueKey = input.agentId
  const previous = agentContextWriteQueues.get(queueKey) || Promise.resolve()

  const operation = previous
    .catch(() => undefined)
    .then(() => appendAgentContextEntryInternal(input))

  agentContextWriteQueues.set(queueKey, operation)

  try {
    return await operation
  } finally {
    if (agentContextWriteQueues.get(queueKey) === operation) {
      agentContextWriteQueues.delete(queueKey)
    }
  }
}

async function appendAgentContextEntryInternal(input: AppendAgentContextEntryInput) {
  // 检查会话是否存在（可能已被删除）
  const session = await prisma.swarmSession.findUnique({
    where: { id: input.swarmSessionId },
    select: { id: true },
  })

  if (!session) {
    console.log(`[AgentContext] Skipping context entry for deleted session ${input.swarmSessionId}`)
    return null
  }

  const maxAttempts = 20

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const latest = await prisma.agentContextEntry.findFirst({
      where: { agentId: input.agentId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })

    try {
      return await prisma.agentContextEntry.create({
        data: {
          swarmSessionId: input.swarmSessionId,
          agentId: input.agentId,
          sourceType: input.sourceType,
          sourceId: input.sourceId || null,
          entryType: input.entryType,
          content: input.content,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          visibility: input.visibility || 'private',
          sequence: (latest?.sequence || 0) + 1,
        },
      })
    } catch (error) {
      const isSequenceConflict = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
        && Array.isArray(error.meta?.target)
        && error.meta.target.includes('agent_id')
        && error.meta.target.includes('sequence')

      if (!isSequenceConflict || attempt === maxAttempts - 1) {
        throw error
      }
    }
  }

  throw new Error(`Failed to append agent context entry for agent ${input.agentId}`)
}

export async function listAgentContextEntries(agentId: string, limit = 100) {
  return prisma.agentContextEntry.findMany({
    where: { agentId },
    orderBy: { sequence: 'desc' },
    take: Math.min(limit, 200),
  })
}

export async function clearAgentContext(agentId: string) {
  return prisma.agentContextEntry.deleteMany({
    where: { agentId },
  })
}
