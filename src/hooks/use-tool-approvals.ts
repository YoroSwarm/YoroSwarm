import { useState, useEffect, useCallback, useRef } from 'react'
import type { ToolApprovalRequestPayload, ToolApprovalUpdatePayload, RiskLevel } from '@/types/websocket'

export interface ToolApproval {
  id: string
  type: 'SHELL_EXEC' | 'FILE_WRITE' | 'NETWORK_REQUEST'
  toolName: string
  description: string
  inputParams: Record<string, unknown>
  workingDir?: string
  createdAt: string
  expiresAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
  result?: string
  error?: string
  riskLevel?: RiskLevel
  riskReason?: string
  riskCategory?: string
}

interface ApprovalApiResponse {
  id: string
  type: string
  tool_name: string
  description: string
  input_params: Record<string, unknown>
  working_dir?: string
  created_at: string
  expires_at: string
  risk_level?: RiskLevel
  risk_reason?: string
  risk_category?: string
}

export function useToolApprovals(sessionId: string | null) {
  const [approvals, setApprovals] = useState<ToolApproval[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 使用 ref 存储最新的 sessionId，避免闭包问题
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // 从服务器获取待审批列表
  const fetchApprovals = useCallback(async () => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    try {
      setIsLoading(true)
      const response = await fetch(`/api/tool-approvals?sessionId=${currentSessionId}`)
      if (!response.ok) throw new Error('Failed to fetch approvals')

      const data = await response.json()
      if (data.success && data.data?.approvals) {
        setApprovals(data.data.approvals.map((a: ApprovalApiResponse) => ({ ...a, status: 'PENDING' as const })))
      }
    } catch (error) {
      console.error('[useToolApprovals] Failed to fetch approvals:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 处理审批决定
  const handleDecision = useCallback(async (approvalId: string, decision: 'approve' | 'reject') => {
    try {
      const response = await fetch(`/api/tool-approvals/${approvalId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process decision')
      }

      const data = await response.json()
      if (data.success) {
        // 从待审批列表中移除
        setApprovals(prev => prev.filter(a => a.id !== approvalId))
        return { success: true }
      }

      throw new Error(data.error || 'Failed to process decision')
    } catch (error) {
      console.error('[useToolApprovals] Failed to process decision:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, [])

  // 处理 WebSocket 消息 - 使用 ref 访问最新的 sessionId
  const handleWSMessage = useCallback((message: { type: string; payload: unknown }) => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    if (message.type === 'tool_approval_request') {
      const payload = message.payload as ToolApprovalRequestPayload
      if (payload.swarm_session_id === currentSessionId) {
        setApprovals(prev => {
          // 避免重复添加
          if (prev.some(a => a.id === payload.approval_id)) return prev
          return [
            {
              id: payload.approval_id,
              type: payload.type,
              toolName: payload.tool_name,
              description: payload.description,
              inputParams: payload.input_params,
              workingDir: payload.working_dir,
              createdAt: payload.created_at,
              expiresAt: payload.expires_at,
              status: 'PENDING',
              riskLevel: payload.risk_level,
              riskReason: payload.risk_reason,
              riskCategory: payload.risk_category,
            },
            ...prev,
          ]
        })
      }
    } else if (message.type === 'tool_approval_update') {
      const payload = message.payload as ToolApprovalUpdatePayload
      if (payload.swarm_session_id === currentSessionId) {
        setApprovals(prev => {
          const index = prev.findIndex(a => a.id === payload.approval_id)
          if (index === -1) return prev

          const updated = [...prev]
          if (payload.status === 'APPROVED' || payload.status === 'REJECTED') {
            // 移除已处理的审批
            updated.splice(index, 1)
          } else {
            // 更新状态
            updated[index] = {
              ...updated[index],
              status: payload.status,
              result: payload.result,
              error: payload.error,
            }
          }
          return updated
        })
      }
    }
  }, [])

  // 清理过期的审批
  useEffect(() => {
    const interval = setInterval(() => {
      setApprovals(prev => {
        const now = new Date()
        return prev.filter(a => new Date(a.expiresAt) > now && a.status === 'PENDING')
      })
    }, 10000) // 每10秒检查一次

    return () => clearInterval(interval)
  }, [])

  // 初始化时加载
  useEffect(() => {
    if (sessionId) {
      fetchApprovals()
    }
  }, [sessionId, fetchApprovals])

  return {
    approvals,
    isLoading,
    handleDecision,
    handleWSMessage,
    refetch: fetchApprovals,
  }
}
