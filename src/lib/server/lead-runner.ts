import type { LLMMessage } from './llm/types'
import { runAgentLoop, type ToolExecutor } from './agent-loop'
import { leadTools } from './tools/lead-tools'
import {
  orchestrate,
  type OrchestrateInput,
} from './lead-orchestrator'
import { runTeammateLoop } from './teammate-runner'
import { listExternalMessages } from './external-chat'
import prisma from '@/lib/db'

const LEAD_SYSTEM_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。你的核心职责是规划、协调和决策，**绝不执行具体工作**。

## 你的工作模式

### 第一步：评估用户需求
- 分析用户请求的本质和目标
- 判断是简单问答（直接回复）还是复杂任务（需要团队协作）

### 第二步：规划与执行（仅对复杂任务）
对于需要执行的任务，按以下顺序操作：
1. **decompose_task** - 将任务拆解为可并行执行的子任务，明确依赖关系
2. **provision_teammate** - 根据子任务需求创建合适的队友（可多创建几个实现并行）
3. **assign_task** - 将子任务分配给队友，利用依赖系统实现自动调度
4. **reply_to_user** - 告知用户工作计划

### 第三步：监控与调整
- 队友会自主执行任务并汇报结果
- 如果队友报告失败，分析原因后决定是否重试或调整方案
- 所有任务完成后，汇总结果向用户汇报
- 如果用户要求的是“完整报告/综合分析/总结性报告/完整解读”，在分项分析之外，默认还需要一个最终整合视角；不要把“若干分项已完成”等同于“最终交付已完成”

## 重要原则

### ✅ 必须做的事
- 创建子任务时考虑并行性，无依赖的任务可并行执行
- 对“多方面/多角度/多维度/分别分析/主题+人物+叙事+背景”这类天然可拆分工作，优先拆成多个可并行子任务，并尽量分配给不同队友，而不是让单个队友串行承担全部维度
- 为每个子任务创建专门的队友，明确其角色和能力
- 回复用户时简明扼要，说明工作计划和预期结果。对于长任务，默认只在开始时说明计划、在最终交付时汇总结果；中途只有在用户主动询问进度、任务受阻、或出现关键纠偏信息时再回复用户
- 使用 assign_task 或 send_message_to_teammate 时，只能使用系统上下文中展示的真实 teammate ID；不要自己发明 41、81、teammate_0 之类的引用

### ❌ 禁止做的事
- **绝不亲自写文档、代码、分析报告** - 这是队友的工作
- 不要频繁发送消息给队友询问进度 - 他们会自动汇报
- 不要为单个简单任务创建过多队友 - 合理规划资源
- 不要在中途不断调整计划 - 除非队友报告失败
- 不要创建"跟进进度"、"汇报结果"、"催办"、"等待完成"之类的元任务；这些属于 Lead 自己的职责
- 在所有任务已经完成后，不要再向队友发送“感谢”“请确认当前状态”“保持待命”等礼貌性或确认性消息；直接向用户汇总结果即可

## 调度机制说明

- 任务分配后会自动进入调度队列
- 系统会根据依赖关系自动决定执行顺序
- 无依赖的任务会并行执行（最多3个并发）
- 队友之间可以直接通信协作，无需你中转

## 工具使用
- reply_to_user: 与用户沟通
- decompose_task: 拆解任务，设置依赖关系
- provision_teammate: 创建专业队友
- assign_task: 分配任务（触发自动调度）
- send_message_to_teammate: 仅在需要协调时使用`

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
          status: result.agent.status,
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
    await orchTools.replyToUser(result.finalText, {
      thinkingContent: result.thinkingContent,
      toolCalls: result.toolCalls,
    })
  } else if (result.toolCallsMade > 0) {
    // Update the last message with thinking content and tool calls if not already included
    // This ensures the metadata is saved even when reply_to_user was called during the loop
    const { messages } = await listExternalMessages(input.swarmSessionId, input.userId)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.senderType === 'lead') {
      const existingMetadata = lastMessage.metadata ? JSON.parse(lastMessage.metadata) : {}
      if (!existingMetadata.thinkingContent && result.thinkingContent) {
        await prisma.externalMessage.update({
          where: { id: lastMessage.id },
          data: {
            metadata: JSON.stringify({
              ...existingMetadata,
              thinkingContent: result.thinkingContent,
              toolCalls: result.toolCalls,
            }),
          },
        })
      }
    }
  }
}

const LEAD_REEVALUATION_PROMPT = `你是 Swarm 团队的 Team Lead（团队领导）。一个队友刚刚完成了一项任务，系统需要你重新评估整体情况。

## 评估清单

1. **任务完成情况**：还有哪些任务未完成？是否所有子任务都已执行？
2. **整体成果评估**：已完成的工作是否满足用户的原始需求？
3. **质量问题**：队友的产出是否符合预期？是否需要返工？
4. **遗漏检查**：是否有遗漏的方面需要补充？

## 决策规则

- **所有任务完成 + 结果满意** → 使用 reply_to_user 向用户汇报最终结果
- **有未分配的就绪任务** → 分配给空闲队友
- **任务失败** → 分析原因：是任务定义不清？还是队友能力不足？决定重试或调整
- **发现遗漏** → 创建补充任务

## 重要原则

### ✅ 正确做法
- 基于事实做决策，不要猜测队友的工作细节
- 只在必要时联系用户（重要进展或全部完成）
- 让调度系统自动管理任务执行，不要手动干预

### ❌ 禁止做法
- 不要频繁询问队友进度 - 系统会自动处理
- 不要亲自查看或修改队友的工作成果
- 不要为已完成的任务发送"收到"类消息`

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

  // If the Lead replied to user, update the last message with thinking content and tool calls
  if (result.toolCallsMade > 0) {
    const { messages } = await listExternalMessages(swarmSessionId, userId)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.senderType === 'lead') {
      const existingMetadata = lastMessage.metadata ? JSON.parse(lastMessage.metadata) : {}
      if (!existingMetadata.thinkingContent && result.thinkingContent) {
        await prisma.externalMessage.update({
          where: { id: lastMessage.id },
          data: {
            metadata: JSON.stringify({
              ...existingMetadata,
              thinkingContent: result.thinkingContent,
              toolCalls: result.toolCalls,
            }),
          },
        })
      }
    }
  }
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
    statusParts.push('使用 assign_task 或 send_message_to_teammate 时，请直接复制下面的真实 teammate ID。不要使用序号、占位符、角色别名或自己猜测的名称。')
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

  // Check for recovery status — tasks interrupted by server restart
  const interruptedTasks = context.tasks.filter(t =>
    t.errorSummary?.includes('服务器重启')
  )
  if (interruptedTasks.length > 0) {
    statusParts.push('\n## ⚠️ 中断恢复通知')
    statusParts.push(`以下 ${interruptedTasks.length} 个任务因服务器重启被中断，已重置为待分配状态：`)
    for (const t of interruptedTasks) {
      statusParts.push(`- **${t.title}** (ID: ${t.id})`)
    }
    statusParts.push('请重新分配这些任务给合适的队友。')
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
    const metadata = entry.metadata ? JSON.parse(entry.metadata as string) : null

    if (entry.entryType === 'user_input' || entry.entryType === 'user_goal') {
      messages.push({ role: 'user', content: entry.content })
    } else if (entry.entryType === 'assistant_response') {
      messages.push({ role: 'assistant', content: entry.content })
    } else if (entry.entryType === 'task_completion') {
      messages.push({
        role: 'user',
        content: `[队友汇报] ${entry.content}`,
      })
    } else if (entry.entryType === 'tool_call' && metadata?.toolUseId) {
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use' as const,
          id: metadata.toolUseId,
          name: metadata.toolName,
          input: metadata.toolInput || {},
        }],
      })
    } else if (entry.entryType === 'tool_result' && metadata?.toolUseId) {
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result' as const,
          tool_use_id: metadata.toolUseId,
          content: metadata.resultContent || entry.content,
          is_error: metadata.isError || false,
        }],
      })
    } else if (entry.entryType === 'progress_update') {
      messages.push({ role: 'user', content: `[进度更新] ${entry.content}` })
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
      // Both are strings → merge
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content = `${last.content}\n\n${msg.content}`
      }
      // Both are arrays → concatenate
      else if (Array.isArray(last.content) && Array.isArray(msg.content)) {
        last.content = [...last.content, ...msg.content]
      }
      // Mixed: convert string to text block and merge into array
      else if (Array.isArray(last.content) && typeof msg.content === 'string') {
        last.content = [...last.content, { type: 'text' as const, text: msg.content }]
      } else if (typeof last.content === 'string' && Array.isArray(msg.content)) {
        last.content = [{ type: 'text' as const, text: last.content }, ...msg.content]
      }
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
 * 添加状态检查和锁机制，防止重复启动
 */
async function triggerTeammateExecution(
  swarmSessionId: string,
  teammateId: string,
  taskId: string
): Promise<void> {
  // Small delay to let DB writes settle
  await new Promise(resolve => setTimeout(resolve, 500))

  // Check teammate and task status before triggering
  const [teammate, task] = await Promise.all([
    prisma.agent.findUnique({ where: { id: teammateId } }),
    prisma.teamLeadTask.findUnique({ where: { id: taskId } }),
  ])

  if (!teammate || !task) {
    console.error(`[LeadRunner] Cannot trigger teammate: teammate=${!!teammate}, task=${!!task}`)
    return
  }

  // Check if teammate is already running
  if (teammate.status === 'BUSY') {
    console.log(`[LeadRunner] Teammate ${teammate.name} is already BUSY, skipping execution`)
    return
  }

  // Check if task is in the right state
  if (task.status !== 'ASSIGNED' && task.status !== 'PENDING') {
    console.log(`[LeadRunner] Task ${taskId} is ${task.status}, not triggering teammate`)
    return
  }

  // Check if task is assigned to this teammate
  if (task.assigneeId !== teammateId) {
    console.error(`[LeadRunner] Task ${taskId} is not assigned to teammate ${teammateId}`)
    return
  }

  console.log(`[LeadRunner] Triggering teammate ${teammate.name} for task ${task.title}`)

  try {
    await runTeammateLoop(swarmSessionId, teammateId, taskId)
  } catch (err) {
    console.error(`[LeadRunner] Teammate execution failed:`, err)
    // Update task status to FAILED
    await prisma.teamLeadTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        errorSummary: err instanceof Error ? err.message : 'Unknown error',
      },
    })
    // Reset teammate status to ERROR
    await prisma.agent.update({
      where: { id: teammateId },
      data: { status: 'ERROR' },
    })
  }
}
