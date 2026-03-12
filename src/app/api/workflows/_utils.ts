import { WorkflowStatus } from '@prisma/client'

export type WorkflowRecord = {
  id: string
  name: string
  description: string | null
  status: WorkflowStatus
  teamId: string
  definition: string
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

export function parseWorkflowDefinition(definition: string) {
  try {
    return JSON.parse(definition) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function serializeWorkflow(workflow: WorkflowRecord) {
  const status = workflow.status.toLowerCase()

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || undefined,
    status,
    team_id: workflow.teamId,
    definition: parseWorkflowDefinition(workflow.definition),
    total_tasks: 0,
    completed_tasks: 0,
    failed_tasks: 0,
    progress_percentage: 0,
    is_active: ['created', 'running', 'paused'].includes(status),
    created_at: workflow.createdAt.toISOString(),
    updated_at: workflow.updatedAt.toISOString(),
    started_at: workflow.startedAt?.toISOString(),
    completed_at: workflow.completedAt?.toISOString(),
  }
}

export function mapWorkflowActionToStatus(action: string): WorkflowStatus | null {
  switch (action) {
    case 'start':
    case 'resume':
      return WorkflowStatus.RUNNING
    case 'pause':
      return WorkflowStatus.PAUSED
    case 'stop':
      return WorkflowStatus.STOPPED
    default:
      return null
  }
}

