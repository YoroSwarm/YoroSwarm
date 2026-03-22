import { callLLM, extractTextContent, extractToolUseBlocks } from './llm/client'
import type { AgentLoopResult, ToolDefinition, LLMMessage, LLMResponse, ToolResultBlock } from './llm/types'
import { appendAgentContextEntry } from './agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { recordToolCall, getSessionToolCallCount } from './parallel-scheduler'

const MAX_ITERATIONS = 25
const MAX_SESSION_TOOL_CALLS = 2000

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
  context?: ToolExecutorContext,
) => Promise<string>

export interface ToolExecutorContext {
  currentModel?: string
}

export interface AgentLoopOptions {
  systemPrompt: string
  agentId: string
  agentName: string
  swarmSessionId: string
  tools: ToolDefinition[]
  executeTool: ToolExecutor
  contextMessages: LLMMessage[]
  model?: string
  maxIterations?: number
  onThinking?: (text: string) => void
  stopOnSuccessfulTools?: string[]
  abortSignal?: AbortSignal
  userId?: string
  agentType?: 'lead' | 'teammate'
  shouldStopAfterToolCall?: (input: {
    toolName: string
    result: string
    isError: boolean
    toolCalls: { toolName: string; status: 'calling' | 'completed' | 'error'; inputSummary?: string; resultSummary?: string; timestamp: string }[]
    totalToolCalls: number
    iteration: number
  }) => boolean
}

/**
 * 核心 Agent 循环
 * 1. 调用 LLM（附带工具定义）
 * 2. 如果 LLM 请求使用工具 → 执行工具 → 将结果反馈给 LLM → 继续循环
 * 3. 如果 LLM 返回纯文本 → 结束循环
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    systemPrompt,
    agentId,
    agentName,
    swarmSessionId,
    tools,
    executeTool,
    model,
    maxIterations = MAX_ITERATIONS,
    stopOnSuccessfulTools = [],
    shouldStopAfterToolCall,
    abortSignal,
    agentType,
  } = options

  // Check if aborted before starting
  if (abortSignal?.aborted) {
    return {
      finalText: '任务已暂停',
      toolCallsMade: 0,
      iterationsUsed: 0,
      contextEntriesAdded: [],
    }
  }

  const messages: LLMMessage[] = [...options.contextMessages]
  let totalToolCalls = 0
  let currentModel: string | undefined
  const contextEntriesAdded: string[] = []
  const thinkingContent: string[] = []
  const toolCalls: { toolName: string; status: 'calling' | 'completed' | 'error'; inputSummary?: string; resultSummary?: string; timestamp: string }[] = []
  const singleUseToolsPerRun = new Set(['reply_to_user', 'get_team_roster'])
  const usedSingleUseTools = new Set<string>()
  let maxTokensContinuations = 0
  const MAX_CONTINUATIONS = 5 // prevent infinite continuation loops

  // Broadcast agent status
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: agentId,
        name: agentName,
        status: 'busy',
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Check if aborted before each iteration
    if (abortSignal?.aborted) {
      // Record interruption marker if thinking content was persisted in a previous iteration
      if (thinkingContent.length > 0) {
        await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'system',
          entryType: 'error',
          content: '[会话暂停] 上方的思考内容因会话暂停而未被执行。恢复后请重新评估当前状况。',
        })
      }

      // Broadcast thinking end
      publishRealtimeMessage(
        {
          type: 'agent_thinking',
          payload: {
            agent_id: agentId,
            agent_name: agentName,
            swarm_session_id: swarmSessionId,
            status: 'end',
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: swarmSessionId }
      )

      return {
        finalText: '任务已暂停',
        toolCallsMade: totalToolCalls,
        iterationsUsed: iteration,
        contextEntriesAdded,
      }
    }

    // Broadcast thinking start
    publishRealtimeMessage(
      {
        type: 'agent_thinking',
        payload: {
          agent_id: agentId,
          agent_name: agentName,
          swarm_session_id: swarmSessionId,
          status: 'start',
          timestamp: new Date().toISOString(),
        },
      },
      { sessionId: swarmSessionId }
    )

    let response: LLMResponse
    try {
      response = await callLLM({
        systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        model,
        abortSignal,
        userId: options.userId,
        agentType: options.agentType || 'teammate',
        usageContext: {
          swarmSessionId,
          agentId,
          requestKind: 'agent_loop',
        },
      })
    } catch (error) {
      // Handle abort gracefully — not an error, just a pause
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log(`[AgentLoop][${agentName}] LLM call aborted (session paused)`)

        publishRealtimeMessage(
          {
            type: 'agent_thinking',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              status: 'end',
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        return {
          finalText: '任务已暂停',
          toolCallsMade: totalToolCalls,
          iterationsUsed: iteration,
          contextEntriesAdded,
        }
      }

      const errMsg = error instanceof Error ? error.message : 'Unknown LLM error'
      console.error(`[AgentLoop][${agentName}] LLM call failed at iteration ${iteration}:`, errMsg)

      // Broadcast thinking end on error
      publishRealtimeMessage(
        {
          type: 'agent_thinking',
          payload: {
            agent_id: agentId,
            agent_name: agentName,
            swarm_session_id: swarmSessionId,
            status: 'end',
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: swarmSessionId }
      )

      // Record error in context
      await appendAgentContextEntry({
        swarmSessionId,
        agentId,
        sourceType: 'system',
        entryType: 'error',
        content: `LLM 调用失败: ${errMsg}`,
      })

      return {
        finalText: `抱歉，在处理过程中遇到了错误: ${errMsg}`,
        toolCallsMade: totalToolCalls,
        iterationsUsed: iteration + 1,
        contextEntriesAdded,
      }
    }

    const textContent = extractTextContent(response)
    const toolUseBlocks = extractToolUseBlocks(response)

    // Track the model used for this iteration (for passing to tool executors)
    currentModel = response.model

    // Capture provider reasoning/thinking content (e.g., Anthropic thinking blocks)
    // Persist real thinking to DB and broadcast
    let messageSeq = 0
    if (response.reasoningContent) {
      thinkingContent.push(response.reasoningContent)

      const thinkingEntry = await appendAgentContextEntry({
        swarmSessionId,
        agentId,
        sourceType: 'llm',
        entryType: 'thinking',
        content: response.reasoningContent,
        metadata: { model: currentModel },
      })

      publishRealtimeMessage(
        {
          type: 'agent_thinking',
          payload: {
            agent_id: agentId,
            agent_name: agentName,
            swarm_session_id: swarmSessionId,
            status: 'thinking',
            content: response.reasoningContent,
            entry_id: thinkingEntry?.id,
            timestamp: new Date().toISOString(),
            seq: messageSeq++,
            model: currentModel,
          },
        },
        { sessionId: swarmSessionId }
      )
    }

    // If LLM wants to use tools
    if (response.stopReason === 'tool_use' && toolUseBlocks.length > 0) {
      // Add assistant message with all content blocks
      messages.push({ role: 'assistant', content: response.content })

      // Record Lead's text output alongside tool calls as bubble message
      if (textContent && agentType === 'lead') {
        const bubbleEntry = await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'llm',
          entryType: 'bubble',
          content: textContent,
          metadata: { model: currentModel },
        })

        publishRealtimeMessage(
          {
            type: 'agent_thinking',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              status: 'bubble',
              content: textContent,
              entry_id: bubbleEntry?.id,
              timestamp: new Date().toISOString(),
              seq: messageSeq++,
              model: currentModel,
            },
          },
          { sessionId: swarmSessionId }
        )
      }

      const toolResults: ToolResultBlock[] = []

      for (const toolUse of toolUseBlocks) {
        // Check if aborted before each tool execution
        if (abortSignal?.aborted) {
          // Record interruption marker so resumed context knows tools were not executed
          await appendAgentContextEntry({
            swarmSessionId,
            agentId,
            sourceType: 'system',
            entryType: 'error',
            content: '[会话暂停] 工具调用因会话暂停而未被执行。恢复后请重新评估当前状况。',
          })

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: '工具执行被中断：会话已暂停',
            is_error: true,
          })
          break
        }

        if (singleUseToolsPerRun.has(toolUse.name) && usedSingleUseTools.has(toolUse.name)) {
          console.warn(`[AgentLoop][${agentName}] Skipping repeated single-use tool: ${toolUse.name}`)
          toolCalls.push({
            toolName: toolUse.name,
            status: 'error',
            inputSummary: JSON.stringify(toolUse.input).slice(0, 100),
            resultSummary: 'Skipped repeated single-use tool invocation in the same loop',
            timestamp: new Date().toISOString(),
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: '工具执行失败: 同一轮处理中不允许重复调用该工具。',
            is_error: true,
          })
          continue
        }

        totalToolCalls++
        console.log(`[AgentLoop][${agentName}] Tool call #${totalToolCalls}: ${toolUse.name}`)

        // 全局工具调用计数与限制
        recordToolCall(swarmSessionId)
        const sessionToolCalls = getSessionToolCallCount(swarmSessionId)
        if (sessionToolCalls > MAX_SESSION_TOOL_CALLS) {
          console.warn(`[AgentLoop][${agentName}] Session tool call limit reached (${sessionToolCalls}/${MAX_SESSION_TOOL_CALLS})`)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `会话全局工具调用已达上限 (${MAX_SESSION_TOOL_CALLS})，请结束当前任务。`,
            is_error: true,
          })
          continue
        }

        // Generate unique tool call ID for this specific tool invocation
        const toolCallId = `tc-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const inputSummary = JSON.stringify(toolUse.input).slice(0, 100)

        // Broadcast tool activity - calling
        publishRealtimeMessage(
          {
            type: 'tool_activity',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              tool_call_id: toolCallId,
              tool_name: toolUse.name,
              status: 'calling',
              input_summary: inputSummary,
              timestamp: new Date().toISOString(),
              seq: messageSeq++,
              model: currentModel,
            },
          },
          { sessionId: swarmSessionId }
        )

        // Broadcast tool usage (existing internal_message)
        publishRealtimeMessage(
          {
            type: 'internal_message',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              action: 'tool_call',
              tool_name: toolUse.name,
              swarm_session_id: swarmSessionId,
              message: `${agentName} 正在调用工具: ${toolUse.name}`,
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        // Check if aborted before executing tool
        if (abortSignal?.aborted) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: '工具执行被中断：会话已暂停',
            is_error: true,
          })
          break
        }

        // Check session status before executing tool
        // This provides an additional check beyond abortSignal
        // (useful for tools that don't respect abortSignal)
        try {
          const prisma = (await import('@/lib/db')).default
          const session = await prisma.swarmSession.findUnique({
            where: { id: swarmSessionId },
            select: { status: true },
          })

          if (!session) {
            console.log(`[AgentLoop][${agentName}] Session deleted, stopping loop`)

            publishRealtimeMessage(
              {
                type: 'agent_thinking',
                payload: {
                  agent_id: agentId,
                  agent_name: agentName,
                  swarm_session_id: swarmSessionId,
                  status: 'end',
                  timestamp: new Date().toISOString(),
                },
              },
              { sessionId: swarmSessionId }
            )

            return {
              finalText: '会话已删除',
              toolCallsMade: totalToolCalls,
              iterationsUsed: iteration,
              contextEntriesAdded,
            }
          }

          if (session.status === 'PAUSED') {
            console.log(`[AgentLoop][${agentName}] Session paused, stopping tool execution`)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: '工具执行被中断：会话已暂停',
              is_error: true,
            })
            break
          }
        } catch (sessionCheckError) {
          console.error(`[AgentLoop][${agentName}] Session status check failed:`, sessionCheckError)
          // Continue anyway - this is just an optimization
        }

        let result: string
        let isError = false
        try {
          result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, { currentModel })
          if (!isError && singleUseToolsPerRun.has(toolUse.name)) {
            usedSingleUseTools.add(toolUse.name)
          }
        } catch (error) {
          isError = true
          result = `工具执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`
          console.error(`[AgentLoop][${agentName}] Tool ${toolUse.name} failed:`, result)
        }

        // Broadcast tool activity - completed or error
        publishRealtimeMessage(
          {
            type: 'tool_activity',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              tool_call_id: toolCallId,
              tool_name: toolUse.name,
              status: isError ? 'error' : 'completed',
              result_summary: result.slice(0, 100),
              timestamp: new Date().toISOString(),
              model: currentModel,
            },
          },
          { sessionId: swarmSessionId }
        )

        const shouldStopAfterTool = !isError
          && stopOnSuccessfulTools.includes(toolUse.name)
          && !result.includes('\"success\":false')

        // Record tool call for persistence (format compatible with frontend)
        toolCalls.push({
          toolName: toolUse.name,
          status: isError ? 'error' : 'completed',
          inputSummary: inputSummary,
          resultSummary: result.slice(0, 200),
          timestamp: new Date().toISOString(),
        })

        const shouldStopFromCallback = !isError && Boolean(shouldStopAfterToolCall?.({
          toolName: toolUse.name,
          result,
          isError,
          toolCalls,
          totalToolCalls,
          iteration,
        }))

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        } satisfies ToolResultBlock)

        if (shouldStopAfterTool || shouldStopFromCallback) {
          messages.push({ role: 'user', content: toolResults })

          publishRealtimeMessage(
            {
              type: 'agent_thinking',
              payload: {
                agent_id: agentId,
                agent_name: agentName,
                swarm_session_id: swarmSessionId,
                status: 'end',
                timestamp: new Date().toISOString(),
              },
            },
            { sessionId: swarmSessionId }
          )

          return {
            finalText: textContent || '',
            toolCallsMade: totalToolCalls,
            iterationsUsed: iteration + 1,
            contextEntriesAdded,
            thinkingContent,
            toolCalls,
          }
        }

        // Record tool call and result in context for persistence/recovery
        await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'tool',
          sourceId: toolCallId, // Use toolCallId as sourceId for linking
          entryType: 'tool_call',
          content: `调用工具: ${toolUse.name}`,
          metadata: {
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            toolInput: toolUse.input,
            toolCallId, // Store for matching with tool_result
            model: currentModel,
          },
        })
        await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'tool',
          sourceId: toolCallId, // Link to the tool_call entry
          entryType: 'tool_result',
          content: result.slice(0, 500),
          metadata: {
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            isError,
            resultContent: result.slice(0, 2000),
            toolCallId, // Store for matching with tool_call
            model: currentModel,
          },
        })
      }

      // Add tool results as next user message
      messages.push({ role: 'user', content: toolResults })
    } else if (response.stopReason === 'max_tokens' && maxTokensContinuations < MAX_CONTINUATIONS) {
      // Response was truncated due to max_tokens limit — continue the loop
      maxTokensContinuations++
      console.warn(`[AgentLoop][${agentName}] Response truncated (max_tokens), continuation ${maxTokensContinuations}/${MAX_CONTINUATIONS}`)

      // Save partial response as assistant message
      if (textContent) {
        messages.push({ role: 'assistant', content: textContent })

        // Record as bubble message for Lead only; discard for non-Lead
        if (agentType === 'lead') {
          const entry = await appendAgentContextEntry({
            swarmSessionId,
            agentId,
            sourceType: 'llm',
            entryType: 'bubble',
            content: textContent,
            metadata: { truncated: true, continuation: maxTokensContinuations },
          })

          publishRealtimeMessage(
            {
              type: 'agent_thinking',
              payload: {
                agent_id: agentId,
                agent_name: agentName,
                swarm_session_id: swarmSessionId,
                status: 'bubble',
                content: textContent,
                entry_id: entry?.id,
                timestamp: new Date().toISOString(),
              },
            },
            { sessionId: swarmSessionId }
          )
        }
      }

      // Add continuation prompt to encourage LLM to keep going
      messages.push({
        role: 'user',
        content: '你的回复因长度限制被截断了。请从截断处继续完成。如果你正在生成文件内容，请使用工具（如 write_file）来写入完整内容，而不是直接在回复中输出长文本。',
      })

      // Continue the loop — next iteration will call LLM again
    } else {
      // LLM returned text without tool calls — loop ends
      // Record as bubble message for Lead only; discard for non-Lead
      if (textContent && agentType === 'lead') {
        const entry = await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'llm',
          entryType: 'bubble',
          content: textContent,
          metadata: { model: currentModel },
        })

        publishRealtimeMessage(
          {
            type: 'agent_thinking',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              status: 'bubble',
              content: textContent,
              entry_id: entry?.id,
              timestamp: new Date().toISOString(),
              model: currentModel,
            },
          },
          { sessionId: swarmSessionId }
        )
      }

      // Broadcast thinking end
      publishRealtimeMessage(
        {
          type: 'agent_thinking',
          payload: {
            agent_id: agentId,
            agent_name: agentName,
            swarm_session_id: swarmSessionId,
            status: 'end',
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: swarmSessionId }
      )

      // Broadcast agent idle
      publishRealtimeMessage(
        {
          type: 'agent_status',
          payload: {
            agent_id: agentId,
            name: agentName,
            status: 'idle',
            swarm_session_id: swarmSessionId,
            timestamp: new Date().toISOString(),
          },
        },
        { sessionId: swarmSessionId }
      )

      return {
        finalText: textContent || '(无响应)',
        toolCallsMade: totalToolCalls,
        iterationsUsed: iteration + 1,
        contextEntriesAdded,
        thinkingContent: thinkingContent.length > 0 ? thinkingContent : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }
    }
  }

  // Max iterations reached
  console.warn(`[AgentLoop][${agentName}] Max iterations (${maxIterations}) reached`)

  // Broadcast agent idle (maxIterations path also needs this)
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: agentId,
        name: agentName,
        status: 'idle',
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  return {
    finalText: '达到最大迭代次数，已停止处理。',
    toolCallsMade: totalToolCalls,
    iterationsUsed: maxIterations,
    contextEntriesAdded,
    thinkingContent: thinkingContent.length > 0 ? thinkingContent : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
