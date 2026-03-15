import { AgentKind, type Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ensureSessionWorkspaceRoot } from './session-workspace'

type RosterMember = {
  name: string
  role: string
  description?: string
  capabilities?: string[]
  kind?: AgentKind
}

type CreateSwarmSessionInput = {
  userId: string
  title?: string | null
  goal?: string | null
  mode?: string | null
  roster?: RosterMember[]
}

function buildDefaultSessionTitle() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toTimeString().slice(0, 5)
  return `新对话 ${date} ${time}`
}

function inferAgentKind(role: string, index: number): AgentKind {
  if (index === 0 || role === 'team_lead') return 'LEAD'
  if (role.includes('research')) return 'RESEARCHER'
  if (role.includes('document') || role.includes('writer')) return 'WRITER'
  if (role.includes('analysis')) return 'ANALYST'
  if (role.includes('engineering') || role.includes('builder') || role.includes('coding')) return 'ENGINEER'
  if (role.includes('coordinator')) return 'COORDINATOR'
  if (role.includes('specialist')) return 'SPECIALIST'
  return 'WORKER'
}

function buildDefaultRoster(goal?: string | null): RosterMember[] {
  const goalLine = goal ? `当前主目标：${goal}` : '当前主目标：推进当前会话任务。'

  return [
    {
      name: 'Team Lead',
      role: 'team_lead',
      description: `负责创建团队、拆解任务、协调队友与输出对用户的最终答复。${goalLine}`,
      capabilities: ['planning', 'delegation', 'coordination', 'quality_control'],
      kind: 'LEAD',
    },
  ]
}

export async function createSwarmSession(input: CreateSwarmSessionInput) {
  const roster = input.roster && input.roster.length > 0 ? input.roster : buildDefaultRoster(input.goal)
  const title = input.title?.trim() || buildDefaultSessionTitle()

  const createdSession = await prisma.$transaction(async (tx) => {
    const session = await tx.swarmSession.create({
      data: {
        userId: input.userId,
        title,
        goal: input.goal || null,
        mode: input.mode || 'general_office',
        status: 'ACTIVE',
      },
    })

    const createdAgents = [] as Array<{ id: string; role: string }>
    for (const [index, member] of roster.entries()) {
      const agent = await tx.agent.create({
        data: {
          swarmSessionId: session.id,
          name: member.name,
          role: member.role,
          kind: member.kind || inferAgentKind(member.role, index),
          description: member.description,
          capabilities: JSON.stringify(member.capabilities || []),
          config: JSON.stringify({
            provisionedBy: 'swarm_session_bootstrap',
            sessionScoped: true,
            isLead: index === 0,
          }),
        },
      })

      createdAgents.push({ id: agent.id, role: agent.role })
    }

    const lead = createdAgents.find((agent) => agent.role === 'team_lead') || createdAgents[0]

    return tx.swarmSession.update({
      where: { id: session.id },
      data: { leadAgentId: lead?.id || null },
      include: {
        agents: true,
        leadAgent: true,
      },
    })
  })

  await ensureSessionWorkspaceRoot(createdSession.id)
  return createdSession
}

export async function resolveSwarmSession(input: {
  swarmSessionId?: string | null
  userId?: string | null
}) {
  if (input.swarmSessionId) {
    return prisma.swarmSession.findUnique({
      where: { id: input.swarmSessionId },
      include: { agents: true, leadAgent: true },
    })
  }

  if (input.userId) {
    return prisma.swarmSession.findFirst({
      where: { userId: input.userId, archivedAt: null },
      include: { agents: true, leadAgent: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  return null
}

export async function getLeadAgentForSession(swarmSessionId: string) {
  const session = await prisma.swarmSession.findUnique({ where: { id: swarmSessionId } })
  if (!session) return null

  if (session.leadAgentId) {
    const lead = await prisma.agent.findUnique({ where: { id: session.leadAgentId } })
    if (lead) {
      return lead
    }
    console.warn(`[getLeadAgentForSession] session.leadAgentId ${session.leadAgentId} not found in agents table, searching for alternative`)
  }

  const lead = await prisma.agent.findFirst({
    where: { swarmSessionId, role: 'team_lead' },
    orderBy: { createdAt: 'asc' },
  })

  if (lead) {
    await prisma.swarmSession.update({
      where: { id: swarmSessionId },
      data: { leadAgentId: lead.id },
    })
    return lead
  }

  const anyAgent = await prisma.agent.findFirst({
    where: { swarmSessionId },
    orderBy: { createdAt: 'asc' },
  })

  if (!anyAgent) {
    console.warn(`[getLeadAgentForSession] No agents found for session: ${swarmSessionId}`)
  }

  return anyAgent
}

export async function getOrCreateExternalConversation(swarmSessionId: string, userId: string, title?: string | null) {
  const session = await prisma.swarmSession.findUnique({ where: { id: swarmSessionId } })
  if (!session) {
    throw new Error('SWARM_SESSION_NOT_FOUND')
  }

  const lead = await getLeadAgentForSession(swarmSessionId)
  if (!lead) {
    throw new Error('LEAD_AGENT_NOT_FOUND')
  }

  const existing = await prisma.externalConversation.findFirst({
    where: { swarmSessionId, userId },
    orderBy: { createdAt: 'asc' },
  })

  if (existing) return existing

  return prisma.externalConversation.create({
    data: {
      swarmSessionId,
      userId,
      leadAgentId: lead.id,
      title: title || session.title,
    },
  })
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function buildSessionTaskData(input: {
  swarmSessionId: string
  creatorId: string
  title: string
  description?: string | null
  priority: number
  assigneeId?: string | null
  parentId?: string | null
  dueDate?: Date | null
}): Prisma.TeamLeadTaskUncheckedCreateInput {
  return {
    swarmSessionId: input.swarmSessionId,
    creatorId: input.creatorId,
    title: input.title,
    description: input.description || null,
    priority: input.priority,
    assigneeId: input.assigneeId || null,
    parentId: input.parentId || null,
    dueDate: input.dueDate || null,
    status: input.assigneeId ? 'ASSIGNED' : 'PENDING',
  }
}
