import { useState, useEffect, useCallback, useRef } from 'react'

export type ApprovalAction = 'auto_approve' | 'always_reject' | 'require_approval'
export type MatchType = 'prefix' | 'regex' | 'risk_level' | 'category'

export interface ApprovalRule {
  id: string
  matchType: MatchType
  matchValue: string
  action: ApprovalAction
  source: 'builtin' | 'user' | 'inline'
  createdAt: string
  description?: string
}

export interface ApprovalRuleStats {
  totalRules: number
  userRules: number
  builtinRules: number
}

export function useApprovalRules(sessionId: string | null) {
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const [stats, setStats] = useState<ApprovalRuleStats>({ totalRules: 0, userRules: 0, builtinRules: 0 })
  const [isLoading, setIsLoading] = useState(false)

  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const fetchRules = useCallback(async () => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    try {
      setIsLoading(true)
      const response = await fetch(`/api/sessions/${currentSessionId}/approval-rules`)
      if (!response.ok) throw new Error('Failed to fetch rules')

      const data = await response.json()
      if (data.success && data.data) {
        setRules(data.data.rules || [])
        setStats(data.data.stats || { totalRules: 0, userRules: 0, builtinRules: 0 })
      }
    } catch (error) {
      console.error('[useApprovalRules] Failed to fetch rules:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const addRule = useCallback(async (rule: {
    matchType: MatchType
    matchValue: string
    action: ApprovalAction
    description?: string
  }) => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return { success: false, error: 'No session' }

    try {
      const response = await fetch(`/api/sessions/${currentSessionId}/approval-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add rule')
      }

      const data = await response.json()
      if (data.success) {
        await fetchRules()
        return { success: true, rule: data.data.rule }
      }
      throw new Error('Failed to add rule')
    } catch (error) {
      console.error('[useApprovalRules] Failed to add rule:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, [fetchRules])

  const removeRule = useCallback(async (ruleId: string) => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return { success: false, error: 'No session' }

    try {
      const response = await fetch(`/api/sessions/${currentSessionId}/approval-rules`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove rule')
      }

      const data = await response.json()
      if (data.success) {
        await fetchRules()
        return { success: true }
      }
      throw new Error('Failed to remove rule')
    } catch (error) {
      console.error('[useApprovalRules] Failed to remove rule:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, [fetchRules])

  const clearAllRules = useCallback(async () => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return { success: false, error: 'No session' }

    try {
      const response = await fetch(`/api/sessions/${currentSessionId}/approval-rules`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      })

      if (!response.ok) throw new Error('Failed to clear rules')

      const data = await response.json()
      if (data.success) {
        await fetchRules()
        return { success: true }
      }
      throw new Error('Failed to clear rules')
    } catch (error) {
      console.error('[useApprovalRules] Failed to clear rules:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, [fetchRules])

  // 快捷方法：从审批卡片添加 "本会话总是允许此类命令"
  const addInlineAutoApprove = useCallback(async (category: string, description: string) => {
    return addRule({
      matchType: 'category',
      matchValue: category,
      action: 'auto_approve',
      description,
    })
  }, [addRule])

  useEffect(() => {
    if (sessionId) {
      fetchRules()
    }
  }, [sessionId, fetchRules])

  return {
    rules,
    stats,
    isLoading,
    addRule,
    removeRule,
    clearAllRules,
    addInlineAutoApprove,
    refetch: fetchRules,
  }
}
