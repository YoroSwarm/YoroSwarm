'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ApprovalCard } from './ApprovalCard'
import { cn } from '@/lib/utils'
import type { ToolApproval } from '@/hooks/use-tool-approvals'

interface ApprovalCardsProps {
  approvals: ToolApproval[]
  onDecision: (id: string, decision: 'approve' | 'reject') => Promise<{ success: boolean; error?: string }>
  onAlwaysAllow?: (category: string, description: string) => Promise<unknown>
  className?: string
}

export function ApprovalCards({ approvals, onDecision, onAlwaysAllow, className }: ApprovalCardsProps) {
  if (approvals.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <AnimatePresence initial={false}>
        {approvals.map((approval, index) => (
          <motion.div
            key={approval.id}
            layout
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: -30 }}
            transition={{
              layout: { type: 'spring', stiffness: 500, damping: 35 },
              opacity: { duration: 0.2, delay: index * 0.04 },
              scale: { duration: 0.2, delay: index * 0.04 },
            }}
          >
            <ApprovalCard
              approval={approval}
              onApprove={() => onDecision(approval.id, 'approve')}
              onReject={() => onDecision(approval.id, 'reject')}
              onAlwaysAllow={onAlwaysAllow}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export { ApprovalCard } from './ApprovalCard'
