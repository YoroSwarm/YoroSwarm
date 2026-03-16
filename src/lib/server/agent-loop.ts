import { callLLM, extractTextContent, extractToolUseBlocks } from './llm/client'
import type { AgentLoopResult, ToolDefinition, LLMMessage, LLMResponse, ToolResultBlock } from './llm/types'
import { appendAgentContextEntry } from './agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { recordToolCall, getSessionToolCallCount } from './parallel-scheduler'

const MAX_ITERATIONS = 25
const MAX_SESSION_TOOL_CALLS = 2000

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<string>

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
  } = options

  const messages: LLMMessage[] = [...options.contextMessages]
  let totalToolCalls = 0
  const contextEntriesAdded: string[] = []
  const thinkingContent: string[] = []
  const toolCalls: { toolName: string; status: 'calling' | 'completed' | 'error'; inputSummary?: string; resultSummary?: string; timestamp: string }[] = []
  const singleUseToolsPerRun = new Set(['reply_to_user', 'get_team_roster'])
  const usedSingleUseTools = new Set<string>()

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
        usageContext: {
          swarmSessionId,
          agentId,
          requestKind: 'agent_loop',
        },
      })
    } catch (error) {
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

    // Message sequence counter for this iteration to ensure ordering
    let messageSeq = 0

    // Broadcast thinking content if LLM returned text alongside tool calls
    if (textContent) {
      // Record thinking content for persistence
      thinkingContent.push(textContent)

      // Persist thinking to DB so it appears in historical view
      await appendAgentContextEntry({
        swarmSessionId,
        agentId,
        sourceType: 'llm',
        entryType: 'thinking',
        content: textContent,
      })

      publishRealtimeMessage(
        {
          type: 'agent_thinking',
          payload: {
            agent_id: agentId,
            agent_name: agentName,
            swarm_session_id: swarmSessionId,
            status: 'thinking',
            content: textContent,
            timestamp: new Date().toISOString(),
            seq: messageSeq++,
          },
        },
        { sessionId: swarmSessionId }
      )
    }

    // If LLM wants to use tools
    if (response.stopReason === 'tool_use' && toolUseBlocks.length > 0) {
      // Add assistant message with all content blocks
      messages.push({ role: 'assistant', content: response.content })

      const toolResults: ToolResultBlock[] = []

      for (const toolUse of toolUseBlocks) {
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

        let result: string
        let isError = false
        try {
          result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>)
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
          },
        })
      }

      // Add tool results as next user message
      messages.push({ role: 'user', content: toolResults })
    } else {
      // LLM returned text without tool calls — loop ends
      if (textContent) {
        const entry = await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'llm',
          entryType: 'assistant_response',
          content: textContent,
        })

        // Broadcast assistant response so frontend can display it in real-time
        publishRealtimeMessage(
          {
            type: 'agent_thinking',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              status: 'response',
              content: textContent,
              entry_id: entry.id,
              timestamp: new Date().toISOString(),
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
  return {
    finalText: '达到最大迭代次数，已停止处理。',
    toolCallsMade: totalToolCalls,
    iterationsUsed: maxIterations,
    contextEntriesAdded,
    thinkingContent: thinkingContent.length > 0 ? thinkingContent : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
