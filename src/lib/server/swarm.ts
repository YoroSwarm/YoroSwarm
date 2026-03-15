import {
  TeamLeadAgentStatus,
  TeamLeadTaskStatus,
  type Agent,
  type TeamLeadTask,
} from '@prisma/client'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'
import { verifyAccessToken, type TokenPayload } from '@/lib/auth/jwt'
import { getLeadAgentForSession, resolveSwarmSession } from '@/lib/server/swarm-session'

export type ApiTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
export type ApiTaskPriority = 'low' | 'medium' | 'high'

export async function requireTokenPayload(): Promise<TokenPayload> {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  if (!token) {
    throw new Error('UNAUTHORIZED')
  }

  try {
    return verifyAccessToken(token)
  } catch {
    throw new Error('UNAUTHORIZED')
  }
}

export async function resolveSessionScope(input: {
  swarmSessionId?: string | null
  userId?: string | null
}) {
  const session = await resolveSwarmSession(input)
  if (session) return session

  if (!input.swarmSessionId && input.userId) {
    return prisma.swarmSession.findFirst({
      where: { userId: input.userId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
  }

  return null
}

export async function getLeadAgent(scope: string | { swarmSessionId?: string | null; userId?: string | null }) {
  if (typeof scope === 'string') {
    const directSession = await prisma.swarmSession.findUnique({ where: { id: scope } })
    if (!directSession) {
      return null
    }

    return getLeadAgentForSession(directSession.id)
  }

  const session = await resolveSessionScope(scope)
  if (!session) return null
  return getLeadAgentForSession(session.id)
}

export function mapDbStatusToApi(status: TeamLeadTaskStatus): ApiTaskStatus {
  switch (status) {
    case 'IN_PROGRESS':
      return 'in_progress'
    case 'COMPLETED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function mapApiStatusToDb(status: string): TeamLeadTaskStatus {
  switch (status) {
    case 'in_progress':
      return 'IN_PROGRESS'
    case 'completed':
      return 'COMPLETED'
    case 'failed':
      return 'FAILED'
    case 'cancelled':
      return 'CANCELLED'
    case 'assigned':
      return 'ASSIGNED'
    default:
      return 'PENDING'
  }
}

export function mapPriorityToNumber(priority?: string | number | null) {
  if (typeof priority === 'number') return priority

  switch (priority) {
    case 'low':
      return 1
    case 'high':
      return 3
    default:
      return 2
  }
}

export function mapNumberToPriority(priority?: number | null): ApiTaskPriority {
  if (priority && priority <= 1) return 'low'
  if (priority && priority >= 3) return 'high'
  return 'medium'
}

export function mapAgentStatusToApi(status: TeamLeadAgentStatus) {
  switch (status) {
    case 'BUSY':
      return 'busy'
    case 'OFFLINE':
      return 'offline'
    case 'ERROR':
      return 'error'
    default:
      return 'idle'
  }
}

export function mapApiAgentStatusToDb(status: string): TeamLeadAgentStatus {
  switch (status) {
    case 'busy':
      return 'BUSY'
    case 'offline':
      return 'OFFLINE'
    case 'error':
      return 'ERROR'
    default:
      return 'IDLE'
  }
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function serializeAgent(agent: Agent & { tasks?: Array<Pick<TeamLeadTask, 'id' | 'title' | 'status'>> }) {
  const tasks = agent.tasks || []
  const currentTask = tasks.find((task) => task.status === 'IN_PROGRESS')

  return {
    id: agent.id,
    name: agent.name,
    type: agent.role === 'team_lead'
      ? 'leader'
      : agent.role.includes('analysis') || agent.role.includes('research') || agent.role.includes('document')
        ? 'specialist'
        : agent.role.includes('coordinator')
          ? 'coordinator'
          : 'worker',
    role: agent.role,
    kind: agent.kind.toLowerCase(),
    status: mapAgentStatusToApi(agent.status),
    description: agent.description || '',
    expertise: parseJson<string[]>(agent.capabilities, []),
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString(),
    last_active_at: agent.updatedAt.toISOString(),
    message_count: 0,
    completed_tasks: tasks.filter((task) => task.status === 'COMPLETED').length,
    current_task_id: currentTask?.id || null,
    swarm_session_id: agent.swarmSessionId,
  }
}

export function serializeTask(
  task: TeamLeadTask & {
    assignee?: Agent | null
    parent?: TeamLeadTask | null
    subtasks?: TeamLeadTask[]
    dependencies?: Array<{
      dependsOnTaskId: string
      dependsOnTask?: Pick<TeamLeadTask, 'status'> | null
    }>
  }
) {
  const dependencyIds = task.dependencies?.map((dependency) => dependency.dependsOnTaskId)
    ?? (task.parentId ? [task.parentId] : [])

  const isLocked = task.dependencies
    ? task.dependencies.some((dependency) => dependency.dependsOnTask?.status !== 'COMPLETED')
    : Boolean(task.parentId && task.parent?.status !== 'COMPLETED')

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: mapDbStatusToApi(task.status),
    priority: mapNumberToPriority(task.priority),
    swarm_session_id: task.swarmSessionId,
    assigned_agent_id: task.assigneeId || undefined,
    assigned_agent: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          role: task.assignee.role,
          status: mapAgentStatusToApi(task.assignee.status),
        }
      : null,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
    started_at: task.startedAt?.toISOString(),
    completed_at: task.completedAt?.toISOString(),
    deadline: task.dueDate?.toISOString(),
    result_summary: task.resultSummary || undefined,
    error_summary: task.errorSummary || undefined,
    dependency_ids: dependencyIds,
    is_locked: isLocked,
  }
}

export function serializeRealtimeTaskUpdate(
  task: TeamLeadTask & {
    assignee?: Pick<Agent, 'id' | 'name'> | null
  },
  message?: string
) {
  return {
    task_id: task.id,
    title: task.title,
    status: mapDbStatusToApi(task.status),
    assignee_id: task.assigneeId || undefined,
    assignee_name: task.assignee?.name,
    priority: mapNumberToPriority(task.priority),
    swarm_session_id: task.swarmSessionId,
    message,
    timestamp: new Date().toISOString(),
  }
}

export function serializeRealtimeAgentStatus(
  agent: Agent & { tasks?: Array<Pick<TeamLeadTask, 'id' | 'status'>> }
) {
  const tasks = agent.tasks || []

  return {
    agent_id: agent.id,
    name: agent.name,
    status: mapAgentStatusToApi(agent.status),
    current_task_id: tasks.find((task) => task.status === 'IN_PROGRESS')?.id,
    total_tasks_completed: tasks.filter((task) => task.status === 'COMPLETED').length,
    total_tasks_failed: tasks.filter((task) => task.status === 'FAILED').length,
    swarm_session_id: agent.swarmSessionId,
    last_active_at: agent.updatedAt.toISOString(),
    timestamp: new Date().toISOString(),
  }
}

export async function listUnlockedSubtasks(taskId: string) {
  const subtasks = await prisma.teamLeadTask.findMany({
    where: { parentId: taskId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  })

  return subtasks.map((task) => ({
    task_id: task.id,
    title: task.title,
    unlocked_by: taskId,
    swarm_session_id: task.swarmSessionId,
  }))
}
