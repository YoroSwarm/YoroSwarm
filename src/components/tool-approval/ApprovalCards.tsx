'use client'

import { ApprovalCard } from './ApprovalCard'
import { cn } from '@/lib/utils'
import type { ToolApproval } from '@/hooks/use-tool-approvals'

interface ApprovalCardsProps {
  approvals: ToolApproval[]
  onDecision: (id: string, decision: 'approve' | 'reject') => Promise<{ success: boolean; error?: string }>
  className?: string
}

export function ApprovalCards({ approvals, onDecision, className }: ApprovalCardsProps) {
  if (approvals.length === 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          onApprove={() => onDecision(approval.id, 'approve')}
          onReject={() => onDecision(approval.id, 'reject')}
          onExpired={() => onDecision(approval.id, 'reject')}
        />
      ))}
    </div>
  )
}

export { ApprovalCard } from './ApprovalCard'
