import {
  TeamLeadAgentStatus,
  TeamLeadTaskStatus,
  WorkflowStatus,
  type Agent,
  type TeamLeadTask,
  type Workflow,
} from '@prisma/client'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'
import { verifyAccessToken, type TokenPayload } from '@/lib/auth/jwt'

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

export async function getDefaultTeam() {
  return prisma.team.findFirst({ orderBy: { createdAt: 'asc' } })
}

export async function resolveTeam(teamId?: string | null) {
  if (!teamId || teamId === 'default') {
    return getDefaultTeam()
  }

  return prisma.team.findUnique({ where: { id: teamId } })
}

export async function getLeadAgent(teamId: string) {
  const lead = await prisma.agent.findFirst({
    where: { teamId, role: 'team_lead' },
    orderBy: { createdAt: 'asc' },
  })

  if (lead) return lead

  return prisma.agent.findFirst({
    where: { teamId },
    orderBy: { createdAt: 'asc' },
  })
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
    status: mapAgentStatusToApi(agent.status),
    description: agent.description || '',
    expertise: parseJson<string[]>(agent.capabilities, []),
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString(),
    last_active_at: agent.updatedAt.toISOString(),
    message_count: 0,
    completed_tasks: tasks.filter((task) => task.status === 'COMPLETED').length,
    current_task_id: currentTask?.title || null,
    team_id: agent.teamId,
  }
}

export function serializeTask(
  task: TeamLeadTask & {
    assignee?: Agent | null
    parent?: TeamLeadTask | null
    subtasks?: TeamLeadTask[]
  }
) {
  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: mapDbStatusToApi(task.status),
    priority: mapNumberToPriority(task.priority),
    team_id: task.teamId || undefined,
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
    dependency_ids: task.parentId ? [task.parentId] : [],
    is_locked: Boolean(task.parentId && task.parent?.status !== 'COMPLETED'),
  }
}

export function mapWorkflowStatusToApi(status: WorkflowStatus) {
  return status.toLowerCase()
}

export function serializeWorkflow(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || undefined,
    status: mapWorkflowStatusToApi(workflow.status),
    workflow_type: 'swarm_session',
    team_id: workflow.teamId,
    definition: parseJson<Record<string, unknown>>(workflow.definition, {}),
    config: {},
    total_tasks: 0,
    completed_tasks: 0,
    failed_tasks: 0,
    progress_percentage: 0,
    is_active: ['created', 'running', 'paused'].includes(mapWorkflowStatusToApi(workflow.status)),
    created_at: workflow.createdAt.toISOString(),
    updated_at: workflow.updatedAt.toISOString(),
    started_at: workflow.startedAt?.toISOString(),
    completed_at: workflow.completedAt?.toISOString(),
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
  }))
}
