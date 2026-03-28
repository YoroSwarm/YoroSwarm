/**
 * Workspace Management Service
 *
 * Workspace is the top-level entity for organizing SwarmSessions.
 * Each Workspace has its own filesystem directory and Python venv,
 * shared by all sessions within the workspace.
 */

import prisma from '@/lib/db'
import {
  ensureWorkspaceRoot,
  ensureWorkspaceVenv,
  deleteWorkspaceDirectory,
} from './session-workspace'

export interface CreateWorkspaceInput {
  userId: string
  name: string
  description?: string
}

export interface UpdateWorkspaceInput {
  name?: string
  description?: string
}

export interface WorkspaceWithStats {
  id: string
  userId: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
  sessionCount: number
  activeSessionCount: number
}

/**
 * Create a new workspace with its filesystem directory and venv.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceWithStats> {
  const workspace = await prisma.workspace.create({
    data: {
      userId: input.userId,
      name: input.name,
      description: input.description || null,
    },
  })

  // Create workspace directory
  await ensureWorkspaceRoot(workspace.id)

  // Async create Python venv (non-blocking)
  ensureWorkspaceVenv(workspace.id).catch((err) =>
    console.warn(`[Workspace] Venv creation failed for ${workspace.id}:`, err)
  )

  return {
    ...workspace,
    sessionCount: 0,
    activeSessionCount: 0,
  }
}

/**
 * List all workspaces for a user with session counts.
 */
export async function listWorkspaces(userId: string): Promise<WorkspaceWithStats[]> {
  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
    include: {
      sessions: {
        select: { status: true, archivedAt: true },
      },
    },
  })

  return workspaces.map((ws) => ({
    id: ws.id,
    userId: ws.userId,
    name: ws.name,
    description: ws.description,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    archivedAt: ws.archivedAt,
    sessionCount: ws.sessions.length,
    activeSessionCount: ws.sessions.filter(
      (s) => s.status !== 'ARCHIVED' && s.archivedAt === null
    ).length,
  }))
}

/**
 * Get a workspace by ID (without user scoping).
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceWithStats | null> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      sessions: {
        select: { status: true, archivedAt: true },
      },
    },
  })

  if (!ws) return null

  return {
    id: ws.id,
    userId: ws.userId,
    name: ws.name,
    description: ws.description,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    archivedAt: ws.archivedAt,
    sessionCount: ws.sessions.length,
    activeSessionCount: ws.sessions.filter(
      (s) => s.status !== 'ARCHIVED' && s.archivedAt === null
    ).length,
  }
}

/**
 * Get a workspace scoped to a specific user.
 */
export async function getWorkspaceByUser(
  workspaceId: string,
  userId: string
): Promise<WorkspaceWithStats | null> {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    include: {
      sessions: {
        select: { status: true, archivedAt: true },
      },
    },
  })

  if (!ws) return null

  return {
    id: ws.id,
    userId: ws.userId,
    name: ws.name,
    description: ws.description,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    archivedAt: ws.archivedAt,
    sessionCount: ws.sessions.length,
    activeSessionCount: ws.sessions.filter(
      (s) => s.status !== 'ARCHIVED' && s.archivedAt === null
    ).length,
  }
}

/**
 * Update a workspace's name and/or description.
 */
export async function updateWorkspace(
  workspaceId: string,
  data: UpdateWorkspaceInput
): Promise<WorkspaceWithStats | null> {
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: data.name,
      description: data.description,
      updatedAt: new Date(),
    },
    include: {
      sessions: {
        select: { status: true, archivedAt: true },
      },
    },
  })

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    archivedAt: updated.archivedAt,
    sessionCount: updated.sessions.length,
    activeSessionCount: updated.sessions.filter(
      (s) => s.status !== 'ARCHIVED' && s.archivedAt === null
    ).length,
  }
}

/**
 * Delete a workspace and all its data.
 * This cascades to sessions, agents, files, etc. at the DB level.
 * Also cleans up agent runtimes and filesystem directory.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  // Get all sessions in this workspace for cleanup
  const sessions = await prisma.swarmSession.findMany({
    where: { workspaceId },
    include: { agents: true },
  })

  // Import cleanup functions lazily to avoid circular deps
  const { cleanupCognitiveLead } = await import('./cognitive-lead-runner')
  const { cleanupCognitiveTeammate } = await import('./cognitive-teammate-runner')
  const { destroyRuntime } = await import('./cognitive-inbox')
  const { clearSessionReadFileCache } = await import('./teammate-tool-executor')
  const { stopScheduler } = await import('./parallel-scheduler')

  // Clean up each session's agent runtimes
  for (const session of sessions) {
    try {
      clearSessionReadFileCache(session.id)
    } catch (err) {
      console.warn(`[Workspace Delete] Error clearing file cache for ${session.id}:`, err)
    }

    if (session.leadAgentId) {
      try {
        cleanupCognitiveLead(session.id, session.leadAgentId)
      } catch (err) {
        console.warn(`[Workspace Delete] Error cleaning up lead ${session.leadAgentId}:`, err)
      }
    }

    for (const agent of session.agents) {
      if (agent.id === session.leadAgentId) continue
      try {
        cleanupCognitiveTeammate(session.id, agent.id)
      } catch (err) {
        console.warn(`[Workspace Delete] Error cleaning up teammate ${agent.id}:`, err)
      }
    }

    for (const agent of session.agents) {
      try {
        destroyRuntime(session.id, agent.id)
      } catch (err) {
        console.warn(`[Workspace Delete] Error destroying runtime for ${agent.id}:`, err)
      }
    }

    try {
      await stopScheduler(session.id)
    } catch (err) {
      console.warn(`[Workspace Delete] Error stopping scheduler for ${session.id}:`, err)
    }
  }

  // Delete filesystem directory
  try {
    await deleteWorkspaceDirectory(workspaceId)
  } catch (err) {
    console.warn(`[Workspace Delete] Error deleting directory for ${workspaceId}:`, err)
  }

  // Delete workspace from DB (cascades to sessions, agents, files, etc.)
  await prisma.workspace.delete({
    where: { id: workspaceId },
  })

  console.log(`[Workspace] Deleted workspace ${workspaceId} with ${sessions.length} sessions`)
}

/**
 * Archive a workspace (soft-delete).
 */
export async function archiveWorkspace(workspaceId: string): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { archivedAt: new Date(), updatedAt: new Date() },
  })
}

/**
 * Unarchive a workspace.
 */
export async function unarchiveWorkspace(workspaceId: string): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { archivedAt: null, updatedAt: new Date() },
  })
}

/**
 * Resolve workspaceId from a session ID.
 */
export async function resolveWorkspaceIdForSession(
  swarmSessionId: string
): Promise<string | null> {
  const session = await prisma.swarmSession.findUnique({
    where: { id: swarmSessionId },
    select: { workspaceId: true },
  })
  return session?.workspaceId || null
}

/**
 * Get sessions within a workspace.
 */
export async function getWorkspaceSessions(
  workspaceId: string,
  options: { includeArchived?: boolean } = {}
) {
  const where: Record<string, unknown> = { workspaceId }
  if (!options.includeArchived) {
    where.archivedAt = null
  }

  return prisma.swarmSession.findMany({
    where,
    orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    include: {
      agents: true,
      tasks: true,
      externalConversations: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })
}
