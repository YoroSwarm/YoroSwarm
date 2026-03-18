'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, Clock, AlertTriangle, Check, X, Loader2 } from 'lucide-react'
import type { ToolApproval } from '@/hooks/use-tool-approvals'

interface ApprovalCardProps {
  approval: ToolApproval
  onApprove: () => Promise<{ success: boolean; error?: string }>
  onReject: () => Promise<{ success: boolean; error?: string }>
  onExpired?: () => void
}

export function ApprovalCard({ approval, onApprove, onReject, onExpired }: ApprovalCardProps) {
  const [isProcessing, setIsProcessing] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(() => {
    const expiresAt = new Date(approval.expiresAt).getTime()
    const now = Date.now()
    return Math.max(0, Math.floor((expiresAt - now) / 1000))
  })

  // 倒计时
  useEffect(() => {
    if (timeLeft <= 0) {
      onExpired?.()
      return
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onExpired?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timeLeft, onExpired])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}分${secs}秒`
  }

  const handleApprove = async () => {
    setIsProcessing('approve')
    setError(null)
    const result = await onApprove()
    if (!result.success) {
      setError(result.error || '审批失败')
      setIsProcessing(null)
    }
  }

  const handleReject = async () => {
    setIsProcessing('reject')
    setError(null)
    const result = await onReject()
    if (!result.success) {
      setError(result.error || '拒绝失败')
      setIsProcessing(null)
    }
  }

  const getToolIcon = () => {
    switch (approval.type) {
      case 'SHELL_EXEC':
        return <Terminal className="h-5 w-5" />
      default:
        return <AlertTriangle className="h-5 w-5" />
    }
  }

  const getToolLabel = () => {
    switch (approval.type) {
      case 'SHELL_EXEC':
        return '执行命令'
      default:
        return '工具操作'
    }
  }

  const getCommandDisplay = () => {
    const params = approval.inputParams as { command?: string }
    return params.command || '(无命令)'
  }

  const isExpired = timeLeft <= 0
  const isNearExpiry = timeLeft <= 60 && timeLeft > 0

  return (
    <div
      className={cn(
        'w-full rounded-xl border bg-card p-4 shadow-lg transition-all animate-fade-in',
        isExpired && 'opacity-50 grayscale',
        isNearExpiry && !isExpired && 'border-amber-500/50 bg-amber-500/5'
      )}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            approval.type === 'SHELL_EXEC' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
          )}>
            {getToolIcon()}
          </div>
          <div>
            <p className="text-sm font-semibold">{getToolLabel()}</p>
            <p className="text-xs text-muted-foreground">需要审批</p>
          </div>
        </div>

        {/* 倒计时 */}
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
          isNearExpiry && !isExpired ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'
        )}>
          <Clock className="h-3.5 w-3.5" />
          {isExpired ? '已过期' : formatTime(timeLeft)}
        </div>
      </div>

      {/* 描述 */}
      <div className="mb-3">
        <p className="text-sm font-medium mb-1">{approval.description}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {approval.workingDir && (
            <>
              <span>工作目录:</span>
              <code className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                {approval.workingDir}
              </code>
            </>
          )}
        </div>
      </div>

      {/* 命令预览 */}
      {approval.type === 'SHELL_EXEC' && (
        <div className="mb-3 rounded-lg bg-muted/50 p-2.5 max-h-32 overflow-y-auto">
          <code className="text-xs font-mono break-all block">
            <span className="text-muted-foreground">$</span> {getCommandDisplay()}
          </code>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleReject}
          disabled={isExpired || isProcessing !== null}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            'border border-border hover:bg-accent hover:text-accent-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isProcessing === 'reject' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          拒绝
        </button>

        <button
          onClick={handleApprove}
          disabled={isExpired || isProcessing !== null}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isProcessing === 'approve' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          批准
        </button>
      </div>
    </div>
  )
}
