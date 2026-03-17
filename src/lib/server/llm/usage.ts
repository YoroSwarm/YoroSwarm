import prisma from '@/lib/db'
import type { LLMProvider, LLMResponse } from './types'

function clampNonNegative(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

export async function recordLlmUsageEvent(input: {
  provider: LLMProvider
  response: LLMResponse
  swarmSessionId?: string
  agentId?: string
  requestKind?: string
}) {
  if (!input.swarmSessionId) {
    return
  }

  // Resolve userId from session for independent usage tracking
  const session = await prisma.swarmSession.findUnique({
    where: { id: input.swarmSessionId },
    select: { userId: true },
  })

  await prisma.llmUsageEvent.create({
    data: {
      swarmSessionId: input.swarmSessionId,
      agentId: input.agentId || null,
      userId: session?.userId || null,
      provider: input.provider,
      model: input.response.model,
      requestKind: input.requestKind || 'general',
      inputTokens: clampNonNegative(input.response.usage.inputTokens),
      outputTokens: clampNonNegative(input.response.usage.outputTokens),
      cacheCreationTokens: clampNonNegative(input.response.usage.cacheCreationTokens),
      cacheReadTokens: clampNonNegative(input.response.usage.cacheReadTokens),
    },
  })
}

export function summarizeUsageTotals(rows: Array<{
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}>) {
  const totals = rows.reduce((acc, row) => {
    acc.input_tokens += clampNonNegative(row.inputTokens)
    acc.output_tokens += clampNonNegative(row.outputTokens)
    acc.cache_creation_tokens += clampNonNegative(row.cacheCreationTokens)
    acc.cache_read_tokens += clampNonNegative(row.cacheReadTokens)
    return acc
  }, {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
  })

  const totalProcessedInput = totals.input_tokens + totals.cache_read_tokens
  const cacheRate = totalProcessedInput > 0
    ? totals.cache_read_tokens / totalProcessedInput
    : 0

  return {
    ...totals,
    total_tokens: Math.max(0, totals.input_tokens + totals.output_tokens),
    total_processed_input_tokens: Math.max(0, totalProcessedInput),
    cache_hit_rate: Math.max(0, Math.min(1, cacheRate)),
  }
}
