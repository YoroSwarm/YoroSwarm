import type { ToolExecutor } from './agent-loop'
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
  const { replyKey, allowReply = true, agentName = 'Lead' } = options
  let replyIssuedInThisBatch = false

  return async (name: string, toolInput: Record<string, unknown>) => {
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

        // Safety net: 检查是否还有 PENDING 未分配的任务
        const pendingUnassigned = await prisma.teamLeadTask.findMany({
          where: {
            swarmSessionId,
            status: 'PENDING',
            assigneeId: null,
          },
          select: { id: true, title: true },
        })

        if (pendingUnassigned.length > 0) {
          const taskList = pendingUnassigned
            .map(t => `- ${t.title} (ID: ${t.id})`)
            .join('\n')
          return JSON.stringify({
            success: false,
            blocked: true,
            reason: `还有 ${pendingUnassigned.length} 个任务处于 PENDING 状态且未分配。你必须先为这些任务分配队友，然后等待所有任务完成后再回复用户。`,
            pending_tasks: taskList,
          })
        }

        // 检查是否还有进行中的任务
        const inProgressTasks = await prisma.teamLeadTask.findMany({
          where: {
            swarmSessionId,
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
          select: { id: true, title: true, status: true, assignee: { select: { name: true } } },
        })

        if (inProgressTasks.length > 0) {
          const taskList = inProgressTasks
            .map(t => `- [${t.status}] ${t.title} → ${t.assignee?.name || '未知'}`)
            .join('\n')
          return JSON.stringify({
            success: false,
            blocked: true,
            reason: `还有 ${inProgressTasks.length} 个任务正在执行中。请等待所有任务完成后再回复用户。如需通知用户中间进度，请在 content 中说明这是中间进度报告而非最终汇总。`,
            in_progress_tasks: taskList,
          })
        }

        // Resolve file references into attachment metadata
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

      case 'provision_teammate': {
        const result = await provisionTeammate(swarmSessionId, leadAgentId, {
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
        const tasks = toolInput.tasks as Array<{
          title: string
          description?: string
          priority?: number
          parentId?: string
          parentTitle?: string
          dependsOnTaskIds?: string[]
          dependsOnTaskTitles?: string[]
        }>
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
        // assignTaskToTeammate 已经处理了任务触发逻辑（包括依赖检查和triggerTaskExecution）
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
          id: item.id as string,
          title: item.title as string,
          details: item.details as string | undefined,
          status: item.status as 'pending' | 'in_progress' | 'completed' | 'dropped',
          category: item.category as 'user_request' | 'deliverable' | 'coordination' | 'verification' | 'other',
          sourceRef: item.sourceRef as string | undefined,
          updatedAt: now,
        })

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
            const saved = await deleteLeadSelfTodoItem({
              leadAgentId,
              itemId,
            })
            if (!saved) {
              return JSON.stringify({ success: false, error: 'todo item not found' })
            }
            return JSON.stringify({ success: true, count: saved.length, changed: true, operation })
          }
          case 'update': {
            const itemId = toolInput.item_id as string | undefined
            const status = toolInput.status as 'pending' | 'in_progress' | 'completed' | 'dropped' | undefined
            if (!itemId || !status) return JSON.stringify({ success: false, error: 'item_id and status are required for update' })
            const saved = await updateLeadSelfTodoItemStatus({
              leadAgentId,
              itemId,
              status,
            })
            if (!saved) {
              return JSON.stringify({ success: false, error: 'todo item not found' })
            }
            return JSON.stringify({ success: true, count: saved.length, changed: true, operation })
          }
          default:
            return JSON.stringify({ success: false, error: 'unsupported todo operation' })
        }
      }

      case 'save_progress': {
        // 保存当前工作进度
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
        // 恢复之前的工作
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

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}
