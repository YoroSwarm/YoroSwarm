'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { MessageItem } from '@/components/chat/MessageItem'
import { SwarmLoader } from '@/components/ui/swarm-loader'
import { formatMessageGroup } from '@/lib/utils/date'
import type { Message } from '@/types/chat'
import { Share2, AlertCircle } from 'lucide-react'
import { appConfig } from '@/lib/config/app'

interface SnapshotMessage {
  id: string
  senderType: string
  senderId: string | null
  content: string
  messageType: string
  metadata: string | null
  createdAt: string
}

interface SnapshotActivity {
  id: string
  agentId: string
  agentName: string
  agentRole: string
  agentKind: string
  sourceType: string
  entryType: string
  content: string
  metadata: string | null
  createdAt: string
}

interface SnapshotMeta {
  leadAgentId: string | null
  leadName: string
  leadAvatar: string | null
  userName: string
  userAvatar: string | null
}

interface ShareData {
  id: string
  title: string
  messages: SnapshotMessage[]
  activities: SnapshotActivity[]
  fileIds: string[]
  meta: SnapshotMeta | null
  createdAt: string
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function convertToMessages(data: ShareData, shareToken: string): Message[] {
  const msgs: Message[] = []
  const meta = data.meta

  for (const msg of data.messages) {
    const isUser = msg.senderType === 'user'
    const parsed = parseMeta(msg.metadata)

    const attachments = parsed?.attachments as Array<{ fileId: string; fileName: string; mimeType: string }> | undefined
    const messageAttachments = attachments?.filter(a => data.fileIds.includes(a.fileId)).map(a => ({
      id: a.fileId,
      type: (a.mimeType?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
      url: `/api/share/${shareToken}/files/${a.fileId}?inline=true`,
      name: a.fileName,
      mimeType: a.mimeType,
    }))

    // Determine message type based on attachments
    let messageType: 'text' | 'image' | 'file' = 'text'
    if (messageAttachments && messageAttachments.length > 0) {
      const firstAttachment = messageAttachments[0]
      if (firstAttachment.type === 'image') {
        messageType = 'image'
      } else if (firstAttachment.type === 'file') {
        messageType = 'file'
      }
    }

    // For Lead messages, ensure sender.id matches meta.leadAgentId for proper isLead detection
    const senderId = isUser ? (msg.senderId || 'user') : (msg.senderId || meta?.leadAgentId || 'lead')

    msgs.push({
      id: msg.id,
      sessionId: '',
      type: messageType,
      content: msg.content,
      sender: {
        id: senderId,
        type: isUser ? 'user' : 'agent',
        name: isUser ? (meta?.userName || '用户') : (meta?.leadName || 'Team Lead'),
        avatar: isUser ? (meta?.userAvatar || undefined) : (meta?.leadAvatar || undefined),
      },
      status: 'received',
      createdAt: msg.createdAt,
      attachments: messageAttachments,
      metadata: {
        ...(parsed?.model ? { model: parsed.model as string } : {}),
      },
    })
  }

  for (const act of data.activities) {
    const actMeta = parseMeta(act.metadata)
    const isLead = act.agentRole === 'lead'
    const senderName = isLead ? (meta?.leadName || act.agentName) : act.agentName
    const senderAvatar = isLead ? (meta?.leadAvatar || undefined) : undefined

    if (act.entryType === 'thinking') {
      msgs.push({
        id: act.id,
        sessionId: '',
        type: 'text',
        content: act.content,
        sender: { id: act.agentId, type: 'agent', name: senderName, avatar: senderAvatar },
        status: 'received',
        createdAt: act.createdAt,
        metadata: {
          activityType: 'thinking',
          ...(actMeta?.model ? { model: actMeta.model as string } : {}),
        },
      })
    } else if (act.entryType === 'bubble') {
      msgs.push({
        id: act.id,
        sessionId: '',
        type: 'text',
        content: act.content,
        sender: { id: act.agentId, type: 'agent', name: senderName, avatar: senderAvatar },
        status: 'received',
        createdAt: act.createdAt,
        metadata: {
          activityType: 'bubble',
          ...(actMeta?.model ? { model: actMeta.model as string } : {}),
        },
      })
    } else if (act.entryType === 'tool_call') {
      const toolCallId = (actMeta?.toolCallId as string) || act.id
      const result = data.activities.find(a => {
        if (a.entryType !== 'tool_result') return false
        const rm = parseMeta(a.metadata)
        return rm?.toolCallId === toolCallId
      })
      const resultMeta = result ? parseMeta(result.metadata) : null

      msgs.push({
        id: act.id,
        sessionId: '',
        type: 'text',
        content: `调用工具: ${(actMeta?.toolName as string) || 'unknown'}`,
        sender: { id: act.agentId, type: 'agent', name: senderName, avatar: senderAvatar },
        status: 'received',
        createdAt: act.createdAt,
        metadata: {
          activityType: 'tool_call',
          toolName: (actMeta?.toolName as string) || 'unknown',
          toolCallId,
          hasResult: !!result,
          isError: (resultMeta?.isError as boolean) || false,
          ...(actMeta?.model ? { model: actMeta.model as string } : {}),
        },
        toolCalls: [{
          toolName: (actMeta?.toolName as string) || 'unknown',
          status: result ? ((resultMeta?.isError as boolean) ? 'error' : 'completed') : 'calling',
          inputSummary: actMeta?.toolInput ? JSON.stringify(actMeta.toolInput) : undefined,
          resultSummary: result?.content,
          timestamp: act.createdAt,
        }],
      })
    }
  }

  return msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function isCompactMessage(m: Message, leadAgentId: string | null) {
  const at = m.metadata?.activityType
  if (at === 'thinking' || at === 'tool_call' || at === 'tool_result') return true
  // Non-Lead agent normal messages are also compact (hidden as badges or skipped)
  if (m.sender.type === 'agent' && at !== 'bubble') {
    const isLeadMsg = m.sender.id === leadAgentId || !leadAgentId
    if (!isLeadMsg) return true
  }
  return false
}

function groupMessages(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = []
  let currentGroup: { date: string; messages: Message[] } | null = null

  for (const msg of messages) {
    const dateStr = formatMessageGroup(msg.createdAt)
    if (!currentGroup || currentGroup.date !== dateStr) {
      currentGroup = { date: dateStr, messages: [] }
      groups.push(currentGroup)
    }
    currentGroup.messages.push(msg)
  }
  return groups
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [data, setData] = useState<ShareData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    params.then(p => {
      setToken(p.token)
      fetch(`/api/share/${p.token}`)
        .then(res => res.json())
        .then(json => {
          if (json.data) {
            setData(json.data)
          } else {
            setError(json.error || '分享链接不存在或已被删除')
          }
        })
        .catch(() => setError('加载失败'))
        .finally(() => setLoading(false))
    })
  }, [params])

  const messages = useMemo(() => {
    if (!data || !token) return []
    return convertToMessages(data, token)
  }, [data, token])

  const messageGroups = useMemo(() => groupMessages(messages), [messages])

  const leadAgentId = data?.meta?.leadAgentId || null

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <SwarmLoader size="lg" text="加载分享内容..." />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">无法加载分享</h1>
        <p className="text-sm text-muted-foreground">{error || '未知错误'}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-3xl flex items-center gap-3">
          <Image src="/icon.svg" alt={appConfig.name} width={24} height={24} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{data.title}</h1>
            <p className="text-xs text-muted-foreground">
              分享于 {new Date(data.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
          <Share2 className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </header>

      {/* Message list — mirrors MessageList grouping logic */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          {messageGroups.map((group) => (
            <div key={group.date} className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-px flex-1 bg-border" />
                <span className="mx-4 text-xs text-muted-foreground">
                  {group.date}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-4">
                {(() => {
                  const elements: React.ReactNode[] = []
                  let i = 0
                  const msgs = group.messages

                  while (i < msgs.length) {
                    const message = msgs[i]
                    const prevMessage = i > 0 ? msgs[i - 1] : undefined

                    if (isCompactMessage(message, leadAgentId)) {
                      // Collect consecutive compact messages
                      const compactGroup: Message[] = []
                      while (i < msgs.length && isCompactMessage(msgs[i], leadAgentId)) {
                        compactGroup.push(msgs[i])
                        i++
                      }
                      elements.push(
                        <div key={`compact-${compactGroup[0].id}`} className="flex flex-wrap gap-1 items-start ml-10">
                          {compactGroup.map(msg => {
                            const msgIsLead = msg.sender.type === 'user' ||
                              (msg.sender.type === 'agent' && (msg.sender.id === leadAgentId || !leadAgentId))
                            return (
                              <MessageItem
                                key={msg.id}
                                message={msg}
                                showAvatar={false}
                                isConsecutive={true}
                                showTime={false}
                                isLead={msgIsLead}
                              />
                            )
                          })}
                        </div>
                      )
                    } else {
                      const prevWasCompact = prevMessage && isCompactMessage(prevMessage, leadAgentId)
                      const showAvatar = !prevMessage || prevWasCompact || prevMessage.sender.id !== message.sender.id
                      const showTime = !prevMessage ||
                        new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000
                      const isLead = message.sender.type === 'user' ||
                        (message.sender.type === 'agent' && (message.sender.id === leadAgentId || !leadAgentId))

                      elements.push(
                        <MessageItem
                          key={message.id}
                          message={message}
                          showAvatar={showAvatar}
                          isConsecutive={!showAvatar}
                          showTime={showTime}
                          isLead={isLead}
                        />
                      )
                      i++
                    }
                  }
                  return elements
                })()}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-center py-6">
            <span className="text-xs text-muted-foreground/50">— 分享内容到此结束 —</span>
          </div>
        </div>
      </main>
    </div>
  )
}
