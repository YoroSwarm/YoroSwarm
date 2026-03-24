import type { ToolExecutor, ToolExecutorContext } from './agent-loop'
import prisma from '@/lib/db'
import {
  provisionTeammate,
  replyToUser,
  sendToTeammate,
} from './lead-orchestrator'
import {
  decomposeTask,
  assignTaskToTeammate,
} from './lead-orchestrator-tasks'
import {
  addLeadSelfTodoItem,
  clearLeadSelfTodoItems,
  deleteLeadSelfTodoItem,
  insertLeadSelfTodoItem,
  updateLeadSelfTodoItemStatus,
} from './lead-self-todo'
import {
  createSnapshot,
  getCognitiveRuntime,
  resumeSnapshot,
} from './cognitive-inbox'
import { assignSkillToAgent } from './skills/skill-registry'
import {
  listWorkspaceDirectory,
  createWorkspaceDirectory,
  readWorkspaceFile,
  saveWorkspaceFile,
  ensureSessionWorkspaceRoot,
  normalizeWorkspaceRelativePath,
  findWorkspaceFileByPath,
} from './session-workspace'
import {
  smartApproval,
  waitForApproval,
  executeApprovedCommand,
} from './tool-approval'
import * as path from 'path'

export interface LeadProcessorInput {
  swarmSessionId: string
  userId: string
  leadAgentId: string
}

export interface LeadToolExecutorOptions {
  replyKey?: string
  allowReply?: boolean
  agentName?: string
}

/**
 * 构建Lead工具执行器
 */
export function buildLeadToolExecutor(input: LeadProcessorInput, options: LeadToolExecutorOptions = {}): ToolExecutor {
  const { swarmSessionId, userId, leadAgentId } = input
  const { replyKey, allowReply = true } = options
  let replyIssuedInThisBatch = false

  return async (name: string, toolInput: Record<string, unknown>, context?: ToolExecutorContext) => {
    switch (name) {
      case 'reply_to_user': {
        if (!allowReply) {
          return JSON.stringify({
            success: false,
            skipped: true,
            reason: 'reply_not_allowed_for_this_message_batch',
          })
        }

        if (replyIssuedInThisBatch) {
          return JSON.stringify({
            success: false,
            skipped: true,
            reason: 'reply_already_issued_for_this_message_batch',
          })
        }

        const fileRefs = (toolInput.file_references as Array<{ file_id: string; file_name: string }>) || []
        let attachments: Array<{ fileId: string; fileName: string; mimeType: string }> | undefined
        if (fileRefs.length > 0) {
          const files = await prisma.file.findMany({
            where: { id: { in: fileRefs.map(f => f.file_id) } },
            select: { id: true, originalName: true, mimeType: true },
          })
          const fileMap = new Map(files.map(f => [f.id, f]))
          attachments = fileRefs.map(ref => {
            const dbFile = fileMap.get(ref.file_id)
            return {
              fileId: ref.file_id,
              fileName: dbFile?.originalName || ref.file_name,
              mimeType: dbFile?.mimeType || 'application/octet-stream',
            }
          })
        }

        const metadata = {
          ...((toolInput.metadata as Record<string, unknown> | undefined) || {}),
          ...(replyKey ? { replyKey } : {}),
          ...(attachments ? { attachments } : {}),
          ...(context?.currentModel ? { model: context.currentModel } : {}),
        }

        const result = await replyToUser(
          swarmSessionId,
          userId,
          leadAgentId,
          toolInput.content as string,
          metadata
        )
        replyIssuedInThisBatch = true
        return JSON.stringify({ success: true, message_id: result.id })
      }

      case 'send_files_to_user': {
        const filePath = toolInput.path as string
        if (!filePath) {
          return JSON.stringify({ success: false, error: '缺少文件路径' })
        }

        const caption = (toolInput.caption as string | undefined) || ''

        // 查找文件
        const root = await ensureSessionWorkspaceRoot(swarmSessionId)
        const normalizedPath = normalizeWorkspaceRelativePath(filePath)
        const absolutePath = path.join(root, normalizedPath)

        if (!absolutePath.startsWith(root)) {
          return JSON.stringify({ success: false, error: '无效的工作区路径' })
        }

        // 查找文件 - 使用 findWorkspaceFileByPath 以支持多种路径格式
        const fileRecord = await findWorkspaceFileByPath(swarmSessionId, filePath)
        const fileInfo = fileRecord
          ? { id: fileRecord.id, originalName: fileRecord.originalName, mimeType: fileRecord.mimeType }
          : null

        if (!fileInfo) {
          return JSON.stringify({ success: false, error: `文件不存在: ${filePath}` })
        }

        const attachments = [{
          fileId: fileInfo.id,
          fileName: fileInfo.originalName,
          mimeType: fileInfo.mimeType,
        }]

        const result = await replyToUser(
          swarmSessionId,
          userId,
          leadAgentId,
          caption,
          { attachments, ...(context?.currentModel ? { model: context.currentModel } : {}) }
        )

        return JSON.stringify({
          success: true,
          message_id: result.id,
          files_sent: 1,
          file_name: fileInfo.originalName,
          path: filePath,
        })
      }

      case 'provision_teammate': {
        const result = await provisionTeammate(swarmSessionId, leadAgentId, {
          id: toolInput.id as string | undefined,
          name: toolInput.name as string,
          role: toolInput.role as string,
          description: (toolInput.description as string) || '',
          capabilities: (toolInput.capabilities as string[]) || [],
        })
        const reusedExisting = 'reusedExisting' in result ? result.reusedExisting : false
        return JSON.stringify({
          success: true,
          teammate_id: result.agent.id,
          name: result.agent.name,
          role: result.agent.role,
          status: result.agent.status,
          reused_existing: reusedExisting,
          message: reusedExisting
            ? `复用已有队友 ${result.agent.name} (${result.agent.role})`
            : undefined,
        })
      }

      case 'decompose_task': {
        // 处理tasks参数，可能是JSON字符串或已解析的数组
        let tasks: Array<{
          id?: string
          title: string
          description?: string
          priority?: number
          parentId?: string
          parentTitle?: string
          dependsOnTaskIds?: string[]
          dependsOnTaskTitles?: string[]
        }>

        const tasksInput = toolInput.tasks
        if (typeof tasksInput === 'string') {
          try {
            tasks = JSON.parse(tasksInput)
          } catch (e) {
            return JSON.stringify({
              success: false,
              error: 'Failed to parse tasks JSON',
              details: e instanceof Error ? e.message : 'Unknown error',
            })
          }
        } else if (Array.isArray(tasksInput)) {
          tasks = tasksInput as typeof tasks
        } else {
          return JSON.stringify({
            success: false,
            error: 'tasks must be an array or JSON string',
          })
        }

        const result = await decomposeTask(swarmSessionId, leadAgentId, tasks)
        return JSON.stringify({
          success: true,
          tasks: result.map(t => ({
            task_id: t.id,
            title: t.title,
            status: t.status,
            reuse_source: 'reuseSource' in t ? t.reuseSource : undefined,
            assignee_id: t.assigneeId,
          })),
        })
      }

      case 'assign_task': {
        const taskId = toolInput.task_id as string
        const teammateId = toolInput.teammate_id as string
        const result = await assignTaskToTeammate(swarmSessionId, leadAgentId, taskId, teammateId)

        return JSON.stringify({
          success: true,
          task_id: result.id,
          assignee: result.assignee?.name,
          assignment_changed: 'assignmentChanged' in result ? result.assignmentChanged : true,
          reused_assignment: 'reusedAssignment' in result ? result.reusedAssignment : false,
        })
      }

      case 'send_message_to_teammate': {
        const result = await sendToTeammate(
          swarmSessionId,
          leadAgentId,
          toolInput.teammate_id as string,
          toolInput.content as string,
          (toolInput.message_type as string) || 'coordination'
        )
        return JSON.stringify({ success: !result.skipped, message_id: result.id, skipped: result.skipped, reason: result.reason })
      }

      case 'update_self_todo': {
        const operation = toolInput.operation as 'clear' | 'add' | 'insert' | 'delete' | 'update'
        const now = new Date().toISOString()

        const parseTodoItem = (item: Record<string, unknown>) => ({
          // id 为空时使用占位符，sanitizeItem 会自动生成语义化 ID
          id: (item.id as string | undefined) || '',
          title: item.title as string,
          details: item.details as string | undefined,
          status: item.status as 'pending' | 'in_progress' | 'completed' | 'dropped',
          category: item.category as 'user_request' | 'deliverable' | 'coordination' | 'verification' | 'other',
          sourceRef: item.sourceRef as string | undefined,
          updatedAt: now,
        })

        // 辅助函数：尝试将 item_id 解析为真实 ID（支持用 title 查找）
        const resolveItemId = async (itemIdOrTitle: string): Promise<{ resolvedId: string; usedTitle: boolean; matchedTitle: string } | null> => {
          // 先尝试按 ID 精确查找
          const byId = await prisma.leadSelfTodo.findFirst({ where: { id: itemIdOrTitle, leadAgentId } })
          if (byId) return { resolvedId: byId.id, usedTitle: false, matchedTitle: byId.title }

          // 再尝试按 title 模糊查找（大小写不敏感）
          const normalized = itemIdOrTitle.trim().toLowerCase()
          const allItems = await prisma.leadSelfTodo.findMany({ where: { leadAgentId } })
          const byTitle = allItems.find(item => item.title.toLowerCase() === normalized)
            || allItems.find(item => item.title.toLowerCase().includes(normalized))
          if (byTitle) return { resolvedId: byTitle.id, usedTitle: true, matchedTitle: byTitle.title }

          return null
        }

        switch (operation) {
          case 'clear': {
            const saved = await clearLeadSelfTodoItems({ leadAgentId })
            return JSON.stringify({ success: true, count: saved.length, changed: true, operation })
          }
          case 'add': {
            const item = toolInput.item as Record<string, unknown> | undefined
            if (!item) return JSON.stringify({ success: false, error: 'item is required for add' })
            const saved = await addLeadSelfTodoItem({
              swarmSessionId,
              leadAgentId,
              item: parseTodoItem(item),
            })
            return JSON.stringify({ success: true, count: saved.length, changed: true, operation })
          }
          case 'insert': {
            const item = toolInput.item as Record<string, unknown> | undefined
            if (!item) return JSON.stringify({ success: false, error: 'item is required for insert' })
            const rawIndex = typeof toolInput.index === 'number' ? toolInput.index : undefined
            const saved = await insertLeadSelfTodoItem({
              swarmSessionId,
              leadAgentId,
              item: parseTodoItem(item),
              index: rawIndex,
            })
            return JSON.stringify({ success: true, count: saved.length, changed: true, operation })
          }
          case 'delete': {
            const itemId = toolInput.item_id as string | undefined
            if (!itemId) return JSON.stringify({ success: false, error: 'item_id is required for delete' })
            const resolved = await resolveItemId(itemId)
            if (!resolved) {
              return JSON.stringify({ success: false, error: 'todo item not found', input_received: itemId })
            }
            const saved = await deleteLeadSelfTodoItem({
              leadAgentId,
              itemId: resolved.resolvedId,
            })
            if (!saved) {
              return JSON.stringify({ success: false, error: 'todo item not found' })
            }
            return JSON.stringify({
              success: true,
              count: saved.length,
              changed: true,
              operation,
              warning: resolved.usedTitle
                ? `你传的是 title "${resolved.matchedTitle}" 而非 id，已按 title 匹配。以后请使用 id（系统内部标识符）来操作待办项，title 仅用于展示。`
                : undefined,
            })
          }
          case 'update': {
            const itemId = toolInput.item_id as string | undefined
            const status = toolInput.status as 'pending' | 'in_progress' | 'completed' | 'dropped' | undefined
            if (!itemId || !status) return JSON.stringify({ success: false, error: 'item_id and status are required for update' })
            const resolved = await resolveItemId(itemId)
            if (!resolved) {
              return JSON.stringify({ success: false, error: 'todo item not found', input_received: itemId })
            }
            const saved = await updateLeadSelfTodoItemStatus({
              leadAgentId,
              itemId: resolved.resolvedId,
              status,
            })
            if (!saved) {
              return JSON.stringify({ success: false, error: 'todo item not found' })
            }
            return JSON.stringify({
              success: true,
              count: saved.length,
              changed: true,
              operation,
              warning: resolved.usedTitle
                ? `你传的是 title "${resolved.matchedTitle}" 而非 id，已按 title 匹配。以后请使用 id（系统内部标识符）来操作待办项，title 仅用于展示。`
                : undefined,
            })
          }
          default:
            return JSON.stringify({ success: false, error: 'unsupported todo operation' })
        }
      }

      case 'save_progress': {
        const snapshotDescription = (toolInput.description as string) || ''
        const snapshotReason = (toolInput.reason as string) || ''
        const snapshotProgress = (toolInput.progress as number) || 50
        const partialResult = toolInput.partial_result as string | undefined
        const thinking = toolInput.thinking as string | undefined
        const runtime = getCognitiveRuntime(swarmSessionId, leadAgentId)
        const previous = runtime?.currentSnapshot || runtime?.contextStack[runtime.contextStack.length - 1]
        const sameAsPrevious = !!previous
          && previous.reason === snapshotReason
          && (previous.currentTask?.description || '') === snapshotDescription
          && (previous.currentTask?.progress || 0) === snapshotProgress
          && (previous.currentTask?.partialResult || undefined) === partialResult
          && (previous.conversationContext?.thinkingContent || undefined) === thinking

        if (sameAsPrevious) {
          return JSON.stringify({ success: true, saved: true, changed: false })
        }

        await createSnapshot(swarmSessionId, leadAgentId, snapshotReason, {
          currentTask: {
            type: (toolInput.work_type as string) || 'general',
            description: snapshotDescription,
            progress: snapshotProgress,
            partialResult,
          },
          conversationContext: {
            messages: [],
            thinkingContent: thinking,
          },
        })
        return JSON.stringify({ success: true, saved: true, changed: true })
      }

      case 'resume_work': {
        const snapshot = await resumeSnapshot(swarmSessionId, leadAgentId)
        return JSON.stringify({
          success: !!snapshot,
          resumed: !!snapshot,
          previous_work: snapshot?.currentTask?.description,
        })
      }

      case 'verify_result': {
        const taskId = toolInput.task_id as string
        const verificationType = toolInput.verification_type as string
        const focusAreas = (toolInput.focus_areas as string[] | undefined) || []
        const instructions = (toolInput.instructions as string | undefined) || ''

        const taskToVerify = await prisma.teamLeadTask.findUnique({
          where: { id: taskId },
          include: { assignee: true },
        })

        if (!taskToVerify) {
          return JSON.stringify({ success: false, error: '任务不存在' })
        }

        if (taskToVerify.status !== 'COMPLETED') {
          return JSON.stringify({ success: false, error: '只能验证已完成的任务' })
        }

        const { getSessionKnowledge } = await import('./shared-knowledge')
        const knowledge = await getSessionKnowledge(swarmSessionId, { taskIds: [taskId] })
        const taskResult = knowledge.length > 0 ? knowledge[0].content : taskToVerify.resultSummary || ''

        if (verificationType === 'cross_validate') {
          const verificationDesc = [
            `对任务 "${taskToVerify.title}" 的结果进行交叉验证。`,
            focusAreas.length > 0 ? `重点验证: ${focusAreas.join(', ')}` : '',
            instructions ? `验证指示: ${instructions}` : '',
            `\n原始结果:\n${taskResult.slice(0, 3000)}`,
          ].filter(Boolean).join('\n')

          const verificationTask = await decomposeTask(swarmSessionId, leadAgentId, [{
            title: `验证: ${taskToVerify.title}`,
            description: verificationDesc,
            priority: 3,
            dependsOnTaskIds: [taskId],
          }])

          return JSON.stringify({
            success: true,
            verification_type: 'cross_validate',
            message: '已创建交叉验证任务，请分配给新的验证专员执行。',
            verification_tasks: verificationTask,
          })
        }

        return JSON.stringify({
          success: true,
          verification_type: verificationType,
          task_title: taskToVerify.title,
          task_result: taskResult.slice(0, 3000),
          assignee: taskToVerify.assignee?.name,
          focus_areas: focusAreas,
          message: '请根据以上结果进行验证，若发现问题可创建修正任务。',
        })
      }

      case 'dismiss_teammate': {
        const teammateId = toolInput.teammate_id as string
        const reason = (toolInput.reason as string) || ''

        // 验证队友存在且属于当前 session
        const teammate = await prisma.agent.findFirst({
          where: { id: teammateId, swarmSessionId },
        })
        if (!teammate) {
          return JSON.stringify({ success: false, error: '队友不存在或不属于当前会话' })
        }
        if (teammate.id === leadAgentId) {
          return JSON.stringify({ success: false, error: '不能移除自己（Lead）' })
        }

        // 检查是否有进行中的任务
        const activeTasks = await prisma.teamLeadTask.findMany({
          where: { assigneeId: teammateId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
          select: { id: true, title: true },
        })
        if (activeTasks.length > 0) {
          return JSON.stringify({
            success: false,
            error: `队友仍有 ${activeTasks.length} 个进行中的任务，请先等待完成或取消任务`,
            active_tasks: activeTasks.map(t => ({ id: t.id, title: t.title })),
          })
        }

        // 标记为 OFFLINE
        await prisma.agent.update({
          where: { id: teammateId },
          data: { status: 'OFFLINE' },
        })

        // 清理该队友的待分配任务（改为 PENDING + 无 assignee）
        await prisma.teamLeadTask.updateMany({
          where: { assigneeId: teammateId, status: 'PENDING' },
          data: { assigneeId: null },
        })

        return JSON.stringify({
          success: true,
          teammate_id: teammateId,
          teammate_name: teammate.name,
          reason,
          message: `已移除队友 ${teammate.name}`,
        })
      }

      case 'assign_skill_to_teammate': {
        const teammateId = toolInput.teammate_id as string
        const skillName = toolInput.skill_name as string

        try {
          const result = await assignSkillToAgent(
            swarmSessionId,
            userId,
            teammateId,
            skillName,
            leadAgentId
          )

          const { deliverMessage } = await import('./cognitive-inbox')
          await deliverMessage(swarmSessionId, teammateId, {
            source: 'system',
            senderId: leadAgentId,
            senderName: 'Lead',
            type: 'system_alert',
            content: `[Skill 已分配] 你已获得 Skill: ${skillName}\n\n${result.instructions}\n\n> 脚本目录: ${result.workspacePath}/scripts/\n> 使用 read_workspace_file 读取脚本，shell_exec 执行脚本。`,
            metadata: { skillName, workspacePath: result.workspacePath },
            swarmSessionId,
            agentId: teammateId,
          })

          return JSON.stringify({
            success: true,
            skill_name: skillName,
            teammate_id: teammateId,
            workspace_path: result.workspacePath,
            message: `已将 Skill "${skillName}" 分配给队友，脚本已挂载到 ${result.workspacePath}`,
          })
        } catch (err) {
          return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to assign skill',
          })
        }
      }

      // Workspace tools for Lead
      case 'list_workspace_files': {
        const directoryPath = (toolInput.directory_path as string) || ''
        const recursive = Boolean(toolInput.recursive)
        return JSON.stringify({ success: true, ...(await listWorkspaceDirectory(swarmSessionId, directoryPath, recursive)) })
      }

      case 'read_workspace_file': {
        const filePath = toolInput.path as string
        try {
          const { file, extracted } = await readWorkspaceFile(swarmSessionId, filePath)
          if (!extracted.success) {
            return JSON.stringify({
              success: false,
              path: filePath,
              mime_type: file.mimeType,
              error: extracted.error || '无法读取文件内容',
            })
          }
          return JSON.stringify({
            success: true,
            path: filePath,
            mime_type: file.mimeType,
            extraction_method: extracted.extractionMethod,
            content: (extracted.text || '').slice(0, 10000),
          })
        } catch (error) {
          return JSON.stringify({
            success: false,
            path: filePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      case 'create_workspace_directory': {
        const relativePath = toolInput.path as string
        const result = await createWorkspaceDirectory(swarmSessionId, relativePath)
        return JSON.stringify({ success: true, path: result.relativePath, kind: 'directory' })
      }

      case 'create_workspace_file': {
        const relativePath = toolInput.path as string
        const content = toolInput.content as string
        const mimeType = (toolInput.mime_type as string) || inferMimeType(relativePath)
        const fileRecord = await saveWorkspaceFile({
          swarmSessionId,
          relativePath,
          content,
          mimeType,
          mode: 'create',
          metadata: {
            sourceAgentId: leadAgentId,
            kind: 'agent_output',
          },
        })
        return JSON.stringify({
          success: true,
          file_id: fileRecord.id,
          path: relativePath,
          mime_type: mimeType,
          size: fileRecord.size,
          operation: 'create',
        })
      }

      case 'replace_workspace_file': {
        const relativePath = toolInput.path as string
        const content = toolInput.content as string
        const mimeType = (toolInput.mime_type as string) || inferMimeType(relativePath)
        const fileRecord = await saveWorkspaceFile({
          swarmSessionId,
          relativePath,
          content,
          mimeType,
          mode: 'replace',
          metadata: {
            sourceAgentId: leadAgentId,
            kind: 'agent_output',
          },
        })
        return JSON.stringify({
          success: true,
          file_id: fileRecord.id,
          path: relativePath,
          mime_type: mimeType,
          size: fileRecord.size,
          operation: 'replace',
        })
      }

      case 'shell_exec': {
        const command = toolInput.command as string
        const description = toolInput.description as string
        const workingDir = toolInput.working_dir as string | undefined
        const timeout = toolInput.timeout as number | undefined

        const leadAgent = await prisma.agent.findUnique({ where: { id: leadAgentId } })
        if (!leadAgent) {
          return JSON.stringify({ success: false, error: 'Lead agent not found' })
        }

        const approvalResult = await smartApproval({
          swarmSessionId,
          agentId: leadAgentId,
          agentName: leadAgent.name,
          type: 'SHELL_EXEC',
          toolName: 'shell_exec',
          inputParams: { command, working_dir: workingDir, timeout },
          description,
          workingDir,
        })

        if (!approvalResult.success || !approvalResult.approvalId) {
          return JSON.stringify({
            success: false,
            error: approvalResult.error || 'Failed to create approval request',
          })
        }

        // 自动放行：跳过等待，直接执行
        if (approvalResult.autoDecision && approvalResult.status === 'AUTO_APPROVED') {
          try {
            const result = await executeApprovedCommand(
              approvalResult.approvalId,
              swarmSessionId,
              leadAgentId,
              leadAgent.name
            )
            return JSON.stringify({
              success: true,
              approval_id: approvalResult.approvalId,
              auto_approved: true,
              risk_level: approvalResult.riskLevel,
              output: result.slice(0, 10000),
            })
          } catch (execError) {
            return JSON.stringify({
              success: false,
              approval_id: approvalResult.approvalId,
              error: execError instanceof Error ? execError.message : 'Command execution failed',
            })
          }
        }

        // 自动拒绝
        if (approvalResult.autoDecision && approvalResult.status === 'AUTO_REJECTED') {
          return JSON.stringify({
            success: false,
            auto_rejected: true,
            risk_level: approvalResult.riskLevel,
            error: approvalResult.error,
          })
        }

        const waitResult = await waitForApproval(approvalResult.approvalId)

        if (waitResult.success && waitResult.status === 'APPROVED') {
          try {
            const result = await executeApprovedCommand(
              approvalResult.approvalId,
              swarmSessionId,
              leadAgentId,
              leadAgent.name
            )
            return JSON.stringify({
              success: true,
              approval_id: approvalResult.approvalId,
              output: result.slice(0, 10000),
            })
          } catch (execError) {
            return JSON.stringify({
              success: false,
              approval_id: approvalResult.approvalId,
              error: execError instanceof Error ? execError.message : 'Command execution failed',
            })
          }
        } else {
          return JSON.stringify({
            success: false,
            approval_id: approvalResult.approvalId,
            status: waitResult.status,
            error: waitResult.error || 'Command execution was not approved',
          })
        }
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}

function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.rb': 'text/x-ruby',
    '.php': 'text/x-php',
    '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.sql': 'text/x-sql',
    '.r': 'text/x-r',
    '.swift': 'text/x-swift',
    '.kt': 'text/x-kotlin',
    '.tex': 'text/x-latex',
    '.log': 'text/plain',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}
