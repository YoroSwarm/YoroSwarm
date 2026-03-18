/**
 * WebSocket API 路由
 *
 * 这个路由主要是占位符，实际的 WebSocket 服务器初始化由 server.mjs 完成
 * 统一的 WebSocket 功能在 src/lib/server/ws-server.ts 中
 *
 * 重要：server.mjs 必须先于 Next.js 路由初始化 WebSocket 服务器
 * 并通过 globalThis.__publishRealtimeMessage 导出 publishRealtimeMessage 函数
 */

import { NextResponse } from 'next/server'
import { clients, getWebSocketServer } from '@/lib/server/ws-server'

// 访问 server.mjs 导出的全局函数
// server.mjs 在启动时（initializeWebSocketServer 之后）设置 globalThis.__publishRealtimeMessage
// 如果 server.mjs 和 Next.js 运行在同一个进程中，这个函数引用应该存在
const globalAny = globalThis as Record<string, unknown>
const serverPublishRealtimeMessage = globalAny.__publishRealtimeMessage as
  | ((message: { type: string; payload: unknown }, scope?: { sessionId?: string; agentId?: string; taskId?: string }) => void)
  | undefined

export function publishRealtimeMessage(
  message: { type: string; payload: unknown },
  scope?: { sessionId?: string; agentId?: string; taskId?: string }
) {
  if (!serverPublishRealtimeMessage) {
    // 如果 server.mjs 没有设置全局函数，说明 WebSocket 服务器未正确初始化
    console.error('[WS Route] server.mjs not initialized! globalThis.__publishRealtimeMessage is undefined')
    console.error('[WS Route] This may indicate server.mjs and Next.js are running in different processes')
    return
  }

  // 使用 server.mjs 的实现在同一个端口上广播
  serverPublishRealtimeMessage(message, scope)
}

export async function GET() {
  const server = getWebSocketServer()

  if (!server) {
    return NextResponse.json(
      {
        status: 'WebSocket server not initialized',
        port: 3000,
        clients: clients.size,
      },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return NextResponse.json(
    {
      status: 'WebSocket server running',
      port: 3000,
      clients: clients.size,
    },
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
