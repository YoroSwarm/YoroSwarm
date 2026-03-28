/**
 * Migration script: Convert existing sessions to workspace-based architecture.
 *
 * For each existing SwarmSession:
 * 1. Create a Workspace (name = session title, userId = session userId)
 * 2. Update SwarmSession.workspaceId = new workspace id
 * 3. Update all File records for this session: set workspaceId
 * 4. Rename filesystem directory: session-workspaces/{sessionId} -> workspaces/{workspaceId}
 */
import { rename, mkdir, stat } from 'fs/promises'
import path from 'path'
import prisma from '../src/lib/db'

const OLD_BASE_DIR = path.resolve('./session-workspaces')
const NEW_BASE_DIR = path.resolve('./workspaces')

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function migrateToWorkspaces() {
  console.log('[Migration] Starting session-to-workspace migration...')

  const sessions = await prisma.swarmSession.findMany()

  console.log(`[Migration] Found ${sessions.length} sessions to migrate`)

  // Ensure new base directory exists
  await mkdir(NEW_BASE_DIR, { recursive: true })

  for (const session of sessions) {
    // 1. Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        userId: session.userId,
        name: session.title || '未命名工作空间',
        description: session.goal || null,
        archivedAt: session.archivedAt,
      },
    })

    console.log(`[Migration] Created workspace "${workspace.name}" (${workspace.id}) for session "${session.title}" (${session.id})`)

    // 2. Update SwarmSession
    await prisma.swarmSession.update({
      where: { id: session.id },
      data: { workspaceId: workspace.id },
    })

    // 3. Update Files (query by swarmSessionId which is still a column on files)
    const fileCount = await prisma.file.count({
      where: { swarmSessionId: session.id },
    })
    if (fileCount > 0) {
      await prisma.file.updateMany({
        where: { swarmSessionId: session.id },
        data: { workspaceId: workspace.id },
      })
      console.log(`[Migration] Updated ${fileCount} files for workspace ${workspace.id}`)
    }

    // 4. Rename filesystem directory
    const oldDir = path.join(OLD_BASE_DIR, session.id)
    const newDir = path.join(NEW_BASE_DIR, workspace.id)

    if (await pathExists(oldDir)) {
      try {
        await rename(oldDir, newDir)
        console.log(`[Migration] Renamed directory: ${oldDir} -> ${newDir}`)
      } catch (err) {
        console.error(`[Migration] Failed to rename directory ${oldDir}:`, err)
      }
    } else {
      console.log(`[Migration] No filesystem directory found at ${oldDir}, skipping rename`)
    }
  }

  // Move .base-venv if it exists in old location
  const oldBaseVenv = path.join(OLD_BASE_DIR, '.base-venv')
  const newBaseVenv = path.join(NEW_BASE_DIR, '.base-venv')
  if (await pathExists(oldBaseVenv)) {
    try {
      await rename(oldBaseVenv, newBaseVenv)
      console.log(`[Migration] Moved .base-venv to new location`)
    } catch (err) {
      console.error(`[Migration] Failed to move .base-venv:`, err)
    }
  }

  console.log('[Migration] Migration complete!')
}

migrateToWorkspaces()
  .catch((err) => {
    console.error('[Migration] Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
