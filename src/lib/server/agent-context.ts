import prisma from '@/lib/db'

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
  const latest = await prisma.agentContextEntry.findFirst({
    where: { agentId: input.agentId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })

  return prisma.agentContextEntry.create({
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
