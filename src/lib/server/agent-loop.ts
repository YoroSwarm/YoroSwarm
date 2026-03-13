import { callLLM, extractTextContent, extractToolUseBlocks } from './llm/client'
import type { AgentLoopResult, ToolDefinition, LLMMessage, LLMResponse, ToolResultBlock } from './llm/types'
import { appendAgentContextEntry } from './agent-context'
import { publishRealtimeMessage } from '@/app/api/ws/route'

const MAX_ITERATIONS = 20

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
  } = options

  const messages: LLMMessage[] = [...options.contextMessages]
  let totalToolCalls = 0
  const contextEntriesAdded: string[] = []

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

    // Broadcast thinking content if LLM returned text alongside tool calls
    if (textContent) {
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
        totalToolCalls++
        console.log(`[AgentLoop][${agentName}] Tool call #${totalToolCalls}: ${toolUse.name}`)

        const inputSummary = JSON.stringify(toolUse.input).slice(0, 100)

        // Broadcast tool activity - calling
        publishRealtimeMessage(
          {
            type: 'tool_activity',
            payload: {
              agent_id: agentId,
              agent_name: agentName,
              swarm_session_id: swarmSessionId,
              tool_name: toolUse.name,
              status: 'calling',
              input_summary: inputSummary,
              timestamp: new Date().toISOString(),
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
              tool_name: toolUse.name,
              status: isError ? 'error' : 'completed',
              result_summary: result.slice(0, 100),
              timestamp: new Date().toISOString(),
            },
          },
          { sessionId: swarmSessionId }
        )

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        } satisfies ToolResultBlock)

        // Record tool call in context
        const entryId = `tool-${toolUse.name}-${Date.now()}`
        await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'tool',
          sourceId: toolUse.name,
          entryType: 'tool_result',
          content: `[工具: ${toolUse.name}] ${isError ? '失败' : '成功'}: ${result.slice(0, 500)}`,
          metadata: { toolName: toolUse.name, isError },
        })
        contextEntriesAdded.push(entryId)
      }

      // Add tool results as next user message
      messages.push({ role: 'user', content: toolResults })
    } else {
      // LLM returned text without tool calls — loop ends
      if (textContent) {
        await appendAgentContextEntry({
          swarmSessionId,
          agentId,
          sourceType: 'llm',
          entryType: 'assistant_response',
          content: textContent,
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
  }
}
