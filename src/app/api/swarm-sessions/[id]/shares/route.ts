import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { mkdir, copyFile, writeFile } from 'fs/promises'
import path from 'path'
import prisma from '@/lib/db'
import { errorResponse, successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api/response'
import { requireTokenPayload, resolveSessionScope } from '@/lib/server/swarm'
import { getSessionWorkspaceRoot } from '@/lib/server/session-workspace'

type RouteContext = { params: Promise<{ id: string }> }

// POST — Create a share link with snapshot
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await context.params

    const session = await resolveSessionScope({ swarmSessionId: id, userId: payload.userId })
    if (!session) return notFoundResponse('Session not found')

    const swarmSession = await prisma.swarmSession.findUnique({
      where: { id },
      select: { title: true, leadAgentId: true },
    })
    if (!swarmSession) return notFoundResponse('Session not found')

    // Fetch user info for snapshot (avatar, display name)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        displayName: true,
        avatarUrl: true,
        leadNickname: true,
        leadAvatarUrl: true,
      },
    })

    // 1. Snapshot messages (ExternalMessage up to now)
    const messages = await prisma.externalMessage.findMany({
      where: { swarmSessionId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderType: true,
        senderId: true,
        content: true,
        messageType: true,
        metadata: true,
        createdAt: true,
      },
    })

    // 2. Snapshot agent activities
    const activities = await prisma.agentContextEntry.findMany({
      where: {
        swarmSessionId: id,
        entryType: { in: ['thinking', 'tool_call', 'tool_result', 'assistant_response', 'bubble'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        agentId: true,
        sourceType: true,
        entryType: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    })

    // Get agent info for activity display
    const agents = await prisma.agent.findMany({
      where: { swarmSessionId: id },
      select: { id: true, name: true, role: true, kind: true },
    })
    const agentMap = Object.fromEntries(agents.map(a => [a.id, { name: a.name, role: a.role, kind: a.kind }]))

    // Enrich activities with agent names
    const enrichedActivities = activities.map(a => ({
      ...a,
      agentName: agentMap[a.agentId]?.name || 'Unknown',
      agentRole: a.agentId === swarmSession.leadAgentId ? 'lead' : 'teammate',
      agentKind: agentMap[a.agentId]?.kind || 'unknown',
      createdAt: a.createdAt.toISOString(),
    }))

    // 3. Extract file info referenced in all messages' attachments (both user and lead)
    // Support both fileId (legacy, from database) and relativePath (preferred, from filesystem)
    const referencedFileIds = new Set<string>()
    const referencedRelativePaths = new Set<string>()
    for (const msg of messages) {
      if (msg.metadata) {
        try {
          const meta = JSON.parse(msg.metadata)
          if (meta.attachments && Array.isArray(meta.attachments)) {
            for (const att of meta.attachments) {
              if (att.fileId) referencedFileIds.add(att.fileId)
              if (att.relativePath) referencedRelativePaths.add(att.relativePath)
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // 4. Copy referenced files to snapshot directory
    const shareToken = randomBytes(16).toString('hex')
    const shareId = randomBytes(8).toString('hex')
    const workspaceRoot = await getSessionWorkspaceRoot(id)
    const snapshotDir = path.join(workspaceRoot, '.share-snapshots', shareToken)
    // Manifest: maps snapshotFilename to original file identifier (fileId or relativePath)
    const snapshotManifest: Record<string, { type: 'fileId' | 'relativePath'; id: string; originalName: string }> = {}

    // Copy files by relativePath (preferred, filesystem-based)
    for (const relativePath of referencedRelativePaths) {
      try {
        const srcPath = path.join(workspaceRoot, relativePath)
        const originalName = path.basename(relativePath)
        // Use a hash of relativePath as prefix for uniqueness
        const hashPrefix = Math.random().toString(36).substring(2, 10)
        const snapshotFilename = `${hashPrefix}_${originalName}`
        const destPath = path.join(snapshotDir, snapshotFilename)
        await copyFile(srcPath, destPath)
        snapshotManifest[snapshotFilename] = { type: 'relativePath', id: relativePath, originalName }
      } catch (err) {
        console.error(`[Share] Failed to copy file by relativePath ${relativePath}:`, err)
      }
    }

    // Copy files by fileId (legacy, database-based) - only if not already copied via relativePath
    if (referencedFileIds.size > 0) {
      const files = await prisma.file.findMany({
        where: { id: { in: [...referencedFileIds] }, swarmSessionId: id },
        select: { id: true, path: true, originalName: true, mimeType: true, filename: true },
      })

      for (const file of files) {
        // Skip if already copied via relativePath (to avoid duplicates)
        const fileRelativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path
        if (referencedRelativePaths.has(fileRelativePath)) continue

        try {
          // file.path can be absolute or relative - handle both cases
          const srcPath = path.isAbsolute(file.path)
            ? file.path
            : path.join(workspaceRoot, file.path)
          const snapshotFilename = `${file.id}_${file.originalName}`
          const destPath = path.join(snapshotDir, snapshotFilename)
          await copyFile(srcPath, destPath)
          snapshotManifest[snapshotFilename] = { type: 'fileId', id: file.id, originalName: file.originalName }
        } catch (err) {
          console.error(`[Share] Failed to copy file ${file.id}:`, err)
        }
      }
    }

    // Save snapshot manifest as JSON file in snapshot directory
    await writeFile(path.join(snapshotDir, '_manifest.json'), JSON.stringify(snapshotManifest, null, 2))

    // 5. Build snapshot metadata (Lead info + user info)
    const leadAgent = swarmSession.leadAgentId ? agentMap[swarmSession.leadAgentId] : null
    const snapshotMeta = {
      leadAgentId: swarmSession.leadAgentId,
      leadName: user?.leadNickname || leadAgent?.name || 'Team Lead',
      leadAvatar: user?.leadAvatarUrl || null,
      userName: user?.displayName || 'User',
      userAvatar: user?.avatarUrl || null,
      // Store file manifest for snapshot file lookup
      fileManifest: snapshotManifest,
    }

    // 6. Create share record
    const share = await prisma.sessionShare.create({
      data: {
        id: shareId,
        swarmSessionId: id,
        shareToken,
        creatorId: payload.userId,
        snapshotTitle: swarmSession.title,
        snapshotMessages: JSON.stringify(messages.map(m => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))),
        snapshotActivities: JSON.stringify(enrichedActivities),
        snapshotFileIds: JSON.stringify(Object.keys(snapshotManifest)),
        snapshotFilesPath: snapshotDir,
        snapshotMeta: JSON.stringify(snapshotMeta),
      },
    })

    const shareUrl = `/share/${shareToken}`

    return successResponse({
      id: share.id,
      shareToken: share.shareToken,
      snapshotTitle: swarmSession.title,
      shareUrl,
      createdAt: share.createdAt.toISOString(),
      messageCount: messages.length,
      fileCount: Object.keys(snapshotManifest).length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('Create share error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// GET — List all shares for a session
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const payload = await requireTokenPayload()
    const { id } = await context.params

    const session = await resolveSessionScope({ swarmSessionId: id, userId: payload.userId })
    if (!session) return notFoundResponse('Session not found')

    const shares = await prisma.sessionShare.findMany({
      where: { swarmSessionId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        shareToken: true,
        snapshotTitle: true,
        createdAt: true,
      },
    })

    return successResponse({
      items: shares.map(s => ({
        ...s,
        shareUrl: `/share/${s.shareToken}`,
        createdAt: s.createdAt.toISOString(),
      })),
      total: shares.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse('Authentication required')
    }
    console.error('List shares error:', error)
    return errorResponse('Internal server error', 500)
  }
}
