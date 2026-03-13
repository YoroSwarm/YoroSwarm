import type { LLMMessage, ToolDefinition } from './llm/types'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { leadTools } from './tools/lead-tools'
import {
  orchestrate,
  type OrchestrateInput,
} from './lead-orchestrator'
import { runTeammateLoop } from './teammate-runner'
import { appendAgentContextEntry, listAgentContextEntries } from './agent-context'

const LEAD_SYSTEM_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。你的职责是：

1. **理解用户需求**：分析用户的请求，理解他们想要达成的目标
2. **规划工作**：将复杂任务拆解为可执行的子任务
3. **组建团队**：根据任务需要创建具有特定角色的队友
4. **分配任务**：将子任务分配给合适的队友
5. **协调工作**：监控进展，协调队友之间的协作
6. **回复用户**：向用户汇报进展和结果

## 重要规则

- 你是领导者，**不要亲自执行具体工作**（如写文档、写代码、做分析）
- 对于简单的问题（闲聊、简单问答），直接用 reply_to_user 回复用户即可
- 对于需要执行的任务，你应该：
  1. 先用 decompose_task 拆解任务
  2. 再用 provision_teammate 创建需要的队友
  3. 最后用 assign_task 分配任务给队友
  4. 然后用 reply_to_user 告知用户你已开始处理
- 你**必须**在每次交互中调用 reply_to_user 至少一次来回复用户
- 所有工具名称和参数请严格按照定义使用

## 当前状态信息

以下是你的上下文，包括历史消息、当前团队成员和任务状态。请基于这些信息做出决策。`

/**
 * 运行 Lead Agent Loop
 * 当用户发送消息时调用
 */
export async function runLeadLoop(input: OrchestrateInput): Promise<void> {
  // 1. 调用 orchestrate 获取上下文和工具函数
  const orchestration = await orchestrate(input)
  const { context, tools: orchTools } = orchestration

  // 2. 构建上下文消息
  const contextMessages = buildLeadContextMessages(
    context,
    input.userMessage,
    input.attachments
  )

  // 3. 创建工具执行器
  const executeTool: ToolExecutor = async (name, toolInput) => {
    switch (name) {
      case 'reply_to_user': {
        const result = await orchTools.replyToUser(
          toolInput.content as string,
          toolInput.metadata as Record<string, unknown> | undefined
        )
        return JSON.stringify({ success: true, message_id: result.id })
      }

      case 'provision_teammate': {
        const result = await orchTools.provisionTeammate({
          name: toolInput.name as string,
          role: toolInput.role as string,
          description: (toolInput.description as string) || '',
          capabilities: (toolInput.capabilities as string[]) || [],
        })
        return JSON.stringify({
          success: true,
          teammate_id: result.agent.id,
          name: result.agent.name,
          role: result.agent.role,
        })
      }

      case 'decompose_task': {
        const tasks = toolInput.tasks as Array<{
          title: string
          description?: string
          priority?: number
          parentId?: string
        }>
        const result = await orchTools.decomposeTask(tasks)
        return JSON.stringify({
          success: true,
          tasks: result.map(t => ({
            task_id: t.id,
            title: t.title,
            status: t.status,
          })),
        })
      }

      case 'assign_task': {
        const taskId = toolInput.task_id as string
        const teammateId = toolInput.teammate_id as string
        const result = await orchTools.assignTaskToTeammate(taskId, teammateId)

        // Trigger teammate loop in background
        triggerTeammateExecution(
          input.swarmSessionId,
          teammateId,
          taskId
        ).catch(err => {
          console.error(`[LeadRunner] Failed to trigger teammate ${teammateId}:`, err)
        })

        return JSON.stringify({
          success: true,
          task_id: result.id,
          status: result.status,
          assignee: result.assignee?.name,
        })
      }

      case 'send_message_to_teammate': {
        const result = await orchTools.sendToTeammate(
          toolInput.teammate_id as string,
          toolInput.content as string
        )
        return JSON.stringify({ success: true, message_id: result.id })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  // 4. 运行 Agent Loop
  const result = await runAgentLoop({
    systemPrompt: LEAD_SYSTEM_PROMPT,
    agentId: input.leadAgentId,
    agentName: 'Team Lead',
    swarmSessionId: input.swarmSessionId,
    tools: leadTools,
    executeTool,
    contextMessages,
    maxIterations: 15,
  })

  console.log(
    `[LeadRunner] Loop completed: ${result.iterationsUsed} iterations, ${result.toolCallsMade} tool calls`
  )

  // If the Lead never called reply_to_user (shouldn't happen but safety net)
  if (result.toolCallsMade === 0 && result.finalText) {
    await orchTools.replyToUser(result.finalText)
  }
}

const LEAD_REEVALUATION_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。一个队友刚刚完成了一项任务。

请评估当前情况并决定下一步行动：

1. **检查所有任务状态**：是否还有待处理的任务？是否需要分配新任务？
2. **评估整体进度**：用户的原始需求是否已经完全满足？
3. **发现改进空间**：是否有遗漏的方面？是否需要补充额外的工作？
4. **动态调整**：如果需要，创建新的队友或新的任务

## 决策规则

- 如果所有任务都已完成且结果令人满意 → 使用 reply_to_user 向用户汇报最终结果
- 如果还有未分配的任务 → 分配给空闲的队友（或创建新队友）
- 如果发现需要补充的工作 → 创建新任务并分配
- 如果某些任务失败了 → 分析原因，决定是否重试
- 你**不需要**每次都回复用户，只在有重要进展或所有工作完成时才 reply_to_user
- 你是领导者，**不要亲自执行具体工作**`

/**
 * Lead 自主反馈循环
 * 当 Teammate 完成任务后自动触发
 * Lead 重新评估、发现改进方向、动态创建新任务/队友
 */
export async function runLeadReEvaluation(
  swarmSessionId: string,
  leadAgentId: string,
  userId: string,
  completedTaskTitle: string,
  completedReport: string
): Promise<void> {
  console.log(`[LeadRunner] Re-evaluation triggered: task "${completedTaskTitle}" completed`)

  const { context, tools: orchTools } = await orchestrate({
    swarmSessionId,
    userId,
    leadAgentId,
    userMessage: `[系统通知] 队友完成了任务 "${completedTaskTitle}"，汇报如下:\n\n${completedReport}`,
  })

  // Check if there are remaining tasks
  const pendingTasks = context.tasks.filter(t =>
    t.status === 'PENDING' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS'
  )

  const contextMessages = buildLeadContextMessages(
    context,
    `[队友任务完成通知]\n\n已完成任务: "${completedTaskTitle}"\n汇报内容: ${completedReport}\n\n当前剩余未完成任务: ${pendingTasks.length} 个\n\n请评估当前情况并决定下一步行动。如果所有工作已完成，请用 reply_to_user 向用户汇报最终结果。`
  )

  // Create tool executor (same as runLeadLoop)
  const executeTool: ToolExecutor = async (name, toolInput) => {
    switch (name) {
      case 'reply_to_user': {
        const result = await orchTools.replyToUser(
          toolInput.content as string,
          toolInput.metadata as Record<string, unknown> | undefined
        )
        return JSON.stringify({ success: true, message_id: result.id })
      }
      case 'provision_teammate': {
        const result = await orchTools.provisionTeammate({
          name: toolInput.name as string,
          role: toolInput.role as string,
          description: (toolInput.description as string) || '',
          capabilities: (toolInput.capabilities as string[]) || [],
        })
        return JSON.stringify({
          success: true,
          teammate_id: result.agent.id,
          name: result.agent.name,
          role: result.agent.role,
        })
      }
      case 'decompose_task': {
        const tasks = toolInput.tasks as Array<{
          title: string; description?: string; priority?: number; parentId?: string
        }>
        const result = await orchTools.decomposeTask(tasks)
        return JSON.stringify({
          success: true,
          tasks: result.map(t => ({ task_id: t.id, title: t.title, status: t.status })),
        })
      }
      case 'assign_task': {
        const taskId = toolInput.task_id as string
        const teammateId = toolInput.teammate_id as string
        const result = await orchTools.assignTaskToTeammate(taskId, teammateId)
        triggerTeammateExecution(swarmSessionId, teammateId, taskId).catch(err => {
          console.error(`[LeadRunner] Failed to trigger teammate ${teammateId}:`, err)
        })
        return JSON.stringify({
          success: true,
          task_id: result.id,
          status: result.status,
          assignee: result.assignee?.name,
        })
      }
      case 'send_message_to_teammate': {
        const result = await orchTools.sendToTeammate(
          toolInput.teammate_id as string,
          toolInput.content as string
        )
        return JSON.stringify({ success: true, message_id: result.id })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  const result = await runAgentLoop({
    systemPrompt: LEAD_REEVALUATION_PROMPT,
    agentId: leadAgentId,
    agentName: 'Team Lead',
    swarmSessionId,
    tools: leadTools,
    executeTool,
    contextMessages,
    maxIterations: 10,
  })

  console.log(
    `[LeadRunner] Re-evaluation completed: ${result.iterationsUsed} iterations, ${result.toolCallsMade} tool calls`
  )
}

/**
 * Build LLM messages from Lead's context
 */
function buildLeadContextMessages(
  context: Awaited<ReturnType<typeof orchestrate>>['context'],
  userMessage: string,
  attachments?: OrchestrateInput['attachments']
): LLMMessage[] {
  const messages: LLMMessage[] = []

  // Build a situation awareness message
  const statusParts: string[] = []

  // Team status
  if (context.teammates.length > 0) {
    statusParts.push('## 当前团队成员')
    for (const t of context.teammates) {
      statusParts.push(
        `- **${t.name}** (ID: ${t.id}) | 角色: ${t.role} | 状态: ${t.status} | 能力: ${t.capabilities || '通用'}`
      )
    }
  } else {
    statusParts.push('## 当前团队\n暂无团队成员（仅你自己）。如果需要执行任务，请先创建队友。')
  }

  // Task status
  if (context.tasks.length > 0) {
    statusParts.push('\n## 当前任务列表')
    for (const t of context.tasks) {
      const assignee = t.assignee ? `→ ${t.assignee.name}` : '未分配'
      statusParts.push(
        `- [${t.status}] **${t.title}** (ID: ${t.id}) ${assignee} | ${t.description || ''}`
      )
    }
  }

  // Session attachments
  if (context.attachments && context.attachments.length > 0) {
    statusParts.push('\n## 会话文件')
    for (const a of context.attachments) {
      statusParts.push(`- ${a.fileName} (ID: ${a.fileId}) | ${a.mimeType} | ${a.size} bytes`)
    }
  }

  if (statusParts.length > 0) {
    messages.push({
      role: 'user',
      content: `[系统状态更新]\n${statusParts.join('\n')}`,
    })
    messages.push({
      role: 'assistant',
      content: '好的，我已了解当前团队和任务状态。请问有什么我可以帮助你的？',
    })
  }

  // Add conversation history from context entries
  const historyEntries = [...context.contextEntries].reverse() // chronological
  for (const entry of historyEntries) {
    if (entry.entryType === 'user_input' || entry.entryType === 'user_goal') {
      messages.push({ role: 'user', content: entry.content })
    } else if (entry.entryType === 'assistant_response') {
      messages.push({ role: 'assistant', content: entry.content })
    } else if (entry.entryType === 'task_completion') {
      messages.push({
        role: 'user',
        content: `[队友汇报] ${entry.content}`,
      })
    }
  }

  // Current user message
  let currentMessage = userMessage
  if (attachments && attachments.length > 0) {
    currentMessage += '\n\n[附件]: ' + attachments.map(a => `${a.fileName} (${a.mimeType})`).join(', ')
  }
  messages.push({ role: 'user', content: currentMessage })

  // Ensure messages alternate correctly (Anthropic requirement)
  return normalizeMessages(messages)
}

/**
 * Ensure messages alternate user/assistant (merge consecutive same-role messages)
 */
function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  if (messages.length === 0) return [{ role: 'user', content: '你好' }]

  const normalized: LLMMessage[] = []

  for (const msg of messages) {
    const last = normalized[normalized.length - 1]
    if (last && last.role === msg.role) {
      // Merge consecutive same-role messages
      const lastContent = typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
      const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      last.content = `${lastContent}\n\n${msgContent}`
    } else {
      normalized.push({ ...msg })
    }
  }

  // Must start with user
  if (normalized[0]?.role !== 'user') {
    normalized.unshift({ role: 'user', content: '你好' })
  }

  return normalized
}

/**
 * Trigger teammate execution in background (fire-and-forget)
 */
async function triggerTeammateExecution(
  swarmSessionId: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // Small delay to let DB writes settle
  await new Promise(resolve => setTimeout(resolve, 500))
  await runTeammateLoop(swarmSessionId, teammateId, taskId)
}
