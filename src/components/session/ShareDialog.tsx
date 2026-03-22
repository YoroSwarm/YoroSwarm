'use client'

import { useState, useCallback } from 'react'
import { Link2, Loader2, Copy, Check } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { swarmSessionsApi, type SessionShareResponse } from '@/lib/api/swarm-sessions'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  onShareCreated?: (share: SessionShareResponse) => void
}

export function ShareDialog({ open, onOpenChange, sessionId, onShareCreated }: ShareDialogProps) {
  const [creating, setCreating] = useState(false)
  const [createdShare, setCreatedShare] = useState<{ token: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const share = await swarmSessionsApi.createShare(sessionId)
      const url = `${window.location.origin}/share/${share.shareToken}`
      setCreatedShare({ token: share.shareToken, url })
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onShareCreated?.(share)
    } catch (err) {
      console.error('创建分享失败:', err)
    } finally {
      setCreating(false)
    }
  }, [sessionId, onShareCreated])

  const handleCopy = useCallback(async () => {
    if (!createdShare) return
    await navigator.clipboard.writeText(createdShare.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [createdShare])

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setCreatedShare(null)
      setCopied(false)
    }
    onOpenChange(open)
  }, [onOpenChange])

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {createdShare ? '分享链接已创建' : '创建分享链接'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 overflow-hidden">
              {createdShare ? (
                <>
                  <p>分享链接已复制到剪贴板。任何拥有此链接的人都可以查看对话记录。</p>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 min-w-0 overflow-hidden">
                    <code className="min-w-0 flex-1 text-xs truncate text-foreground select-all">
                      {createdShare.url}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>确定创建分享链接？</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>链接创建后发送的消息<strong>不会</strong>被包含在分享中</li>
                    <li>通过该链接访问的任何人可查看完整对话记录</li>
                    <li>分享的文件附件将被快照保存</li>
                  </ul>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{createdShare ? '关闭' : '取消'}</AlertDialogCancel>
          {!createdShare && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  创建并复制链接
                </>
              )}
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
