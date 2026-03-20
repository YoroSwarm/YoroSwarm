'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, AlertTriangle, Check, X, Loader2, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import type { ToolApproval } from '@/hooks/use-tool-approvals'
import type { RiskLevel } from '@/types/websocket'

const RISK_CONFIG: Record<RiskLevel, {
  label: string
  icon: React.ElementType
  colorClass: string
  bgClass: string
  borderClass: string
}> = {
  low: {
    label: '低风险',
    icon: ShieldCheck,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
  },
  medium: {
    label: '中风险',
    icon: Shield,
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/30',
  },
  high: {
    label: '高风险',
    icon: ShieldAlert,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
  },
  critical: {
    label: '危险',
    icon: ShieldX,
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
  },
}

interface ApprovalCardProps {
  approval: ToolApproval
  onApprove: () => Promise<{ success: boolean; error?: string }>
  onReject: () => Promise<{ success: boolean; error?: string }>
  onAlwaysAllow?: (category: string, description: string) => Promise<unknown>
}

export function ApprovalCard({ approval, onApprove, onReject, onAlwaysAllow }: ApprovalCardProps) {
  const [isProcessing, setIsProcessing] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alwaysAllow, setAlwaysAllow] = useState(false)

  const riskLevel = approval.riskLevel || 'medium'
  const riskConfig = RISK_CONFIG[riskLevel]
  const RiskIcon = riskConfig.icon

  const handleApprove = async () => {
    setIsProcessing('approve')
    setError(null)

    // 如果勾选了 "总是允许"，先添加规则
    if (alwaysAllow && approval.riskCategory && onAlwaysAllow) {
      await onAlwaysAllow(
        approval.riskCategory,
        `自动放行: ${approval.riskReason || riskConfig.label + '命令'}`
      )
    }

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

  const isCritical = riskLevel === 'critical'
  const isHighRisk = riskLevel === 'high' || isCritical

  return (
    <div
      className={cn(
        'w-full rounded-xl border bg-card p-4 shadow-lg transition-all animate-fade-in',
        isHighRisk && riskConfig.borderClass,
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

        <div className="flex items-center gap-2">
          {/* 风险等级 Badge */}
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border',
            riskConfig.bgClass,
            riskConfig.colorClass,
            riskConfig.borderClass,
          )}>
            <RiskIcon className="h-3.5 w-3.5" />
            {riskConfig.label}
          </div>
        </div>
      </div>

      {/* 风险原因 */}
      {approval.riskReason && (
        <div className={cn(
          'mb-2 px-2.5 py-1.5 rounded-lg text-xs',
          riskConfig.bgClass,
          riskConfig.colorClass,
        )}>
          {approval.riskReason}
        </div>
      )}

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
        <div className={cn(
          'mb-3 rounded-lg p-2.5 max-h-32 overflow-y-auto',
          isHighRisk ? 'bg-muted/70 border border-dashed ' + riskConfig.borderClass : 'bg-muted/50'
        )}>
          <code className="text-xs font-mono break-all block">
            <span className="text-muted-foreground">$</span> {getCommandDisplay()}
          </code>
        </div>
      )}

      {/* "本会话总是允许此类命令" 复选框 — critical 级别不可用 */}
      {approval.riskCategory && !isCritical && onAlwaysAllow && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
          />
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            本会话总是允许此类命令
          </span>
        </label>
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
          disabled={isProcessing !== null}
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
          disabled={isProcessing !== null}
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
          批准{alwaysAllow ? '（并记住）' : ''}
        </button>
      </div>
    </div>
  )
}
