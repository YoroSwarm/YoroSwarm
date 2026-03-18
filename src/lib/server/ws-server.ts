/**
 * 统一的 WebSocket 服务器模块
 *
 * 这个模块被 server.mjs 和 src/app/api/ws/route.ts 共同使用
 * 确保只有一个 WebSocket 服务器实例和客户端列表
 */

import { WebSocketServer, WebSocket } from 'ws'

type WebSocketMessage = {
  type: string
  payload: unknown
  message_id?: string
  requires_ack?: boolean
}

type SubscriptionTarget =
  | 'all'
  | 'session'
  | 'agent'
  | 'task'
  | 'all_agents'
  | 'all_tasks'

type ClientState = {
  id: string
  socket: WebSocket
  subscriptions: Map<SubscriptionTarget, Set<string>>
}

type DeliveryScope = {
  sessionId?: string
  agentId?: string
  taskId?: string
}

// Use globalThis to survive Next.js HMR module re-evaluation
const globalForWs = globalThis as unknown as {
  __wss?: WebSocketServer | null
  __wsClients?: Map<string, ClientState>
  __wsPortLogged?: boolean
}

if (!globalForWs.__wsClients) {
  globalForWs.__wsClients = new Map()
}

export const clients = globalForWs.__wsClients

function getPayloadObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
}

export function createClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function ensureSubscriptionSet(state: ClientState, target: SubscriptionTarget) {
  let values = state.subscriptions.get(target)
  if (!values) {
    values = new Set<string>()
    state.subscriptions.set(target, values)
  }
  return values
}

export function subscribe(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = ensureSubscriptionSet(state, target)
  values.add(id || '*')
}

export function unsubscribe(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = state.subscriptions.get(target)
  if (!values) return

  values.delete(id || '*')
  if (values.size === 0) {
    state.subscriptions.delete(target)
  }
}

export function hasSubscription(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = state.subscriptions.get(target)
  if (!values || values.size === 0) return false
  return values.has('*') || (!!id && values.has(id))
}

export function getScopeFromUrl(rawUrl?: string | null): DeliveryScope {
  if (!rawUrl) return {}

  const url = new URL(rawUrl, 'ws://localhost:3000')
  const segments = url.pathname.split('/').filter(Boolean)
  const scope: DeliveryScope = {
    sessionId: url.searchParams.get('sessionId') || undefined,
    agentId: url.searchParams.get('agentId') || undefined,
    taskId: url.searchParams.get('taskId') || undefined,
  }

  if (segments[0] === 'ws' && segments.length >= 3) {
    const [, target, id] = segments
    if (target === 'sessions') scope.sessionId = id
    if (target === 'agents') scope.agentId = id
    if (target === 'tasks') scope.taskId = id
  }

  return scope
}

export function initializeScopeSubscriptions(state: ClientState, scope: DeliveryScope) {
  if (scope.sessionId) subscribe(state, 'session', scope.sessionId)
  if (scope.agentId) subscribe(state, 'agent', scope.agentId)
  if (scope.taskId) subscribe(state, 'task', scope.taskId)
}

export function sendToClient(clientId: string, message: WebSocketMessage) {
  const state = clients.get(clientId)
  if (!state || state.socket.readyState !== WebSocket.OPEN) return
  state.socket.send(JSON.stringify(message))
}

export function shouldDeliver(state: ClientState, scope?: DeliveryScope) {
  if (!scope) {
    return state.subscriptions.size === 0 || hasSubscription(state, 'all')
  }

  const isExplicitlyScoped = state.subscriptions.size > 0
  if (!isExplicitlyScoped) return true
  if (hasSubscription(state, 'all')) return true
  if (scope.sessionId && hasSubscription(state, 'session', scope.sessionId)) return true
  if (scope.agentId && hasSubscription(state, 'agent', scope.agentId)) return true
  if (scope.taskId && hasSubscription(state, 'task', scope.taskId)) return true

  // Debug logging for subscription matching issues
  if (scope.sessionId) {
    const sessionSubs = state.subscriptions.get('session')
    console.log('[shouldDeliver] session check:', {
      scopeSessionId: scope.sessionId,
      subscribedSessionIds: sessionSubs ? Array.from(sessionSubs) : [],
      hasMatch: sessionSubs?.has(scope.sessionId)
    })
  }
  return false
}

export function broadcast(message: WebSocketMessage, options?: { excludeClientId?: string; scope?: DeliveryScope }) {
  const messageStr = JSON.stringify(message)
  let deliveredCount = 0
  clients.forEach((state, clientId) => {
    if (clientId === options?.excludeClientId) return
    if (state.socket.readyState !== WebSocket.OPEN) return
    if (!shouldDeliver(state, options?.scope)) return
    state.socket.send(messageStr)
    deliveredCount++
  })
  if (message.type !== 'pong') {
    console.log('[WS Broadcast]', message.type, 'to', deliveredCount, 'clients (total:', clients.size, ')')
  }
}

export function normalizeSubscriptionTarget(value: unknown): SubscriptionTarget | null {
  switch (value) {
    case 'all':
    case 'session':
    case 'agent':
    case 'task':
    case 'all_agents':
    case 'all_tasks':
      return value
    default:
      return null
  }
}

export function handleSubscriptionMessage(clientId: string, type: 'subscribe' | 'unsubscribe', payload: unknown) {
  const state = clients.get(clientId)
  if (!state) return

  const parsed = getPayloadObject(payload)
  const target = normalizeSubscriptionTarget(parsed.target)
  const id = typeof parsed.id === 'string' ? parsed.id : undefined

  if (!target) {
    sendToClient(clientId, {
      type: 'error',
      payload: { message: 'Invalid subscription target' },
    })
    return
  }

  if (type === 'subscribe') {
    subscribe(state, target, id)
  } else {
    unsubscribe(state, target, id)
  }

  sendToClient(clientId, {
    type: type === 'subscribe' ? 'subscribed' : 'unsubscribed',
    payload: { target, id },
  })
}

export function createWebSocketHandlers(onConnection?: (socket: WebSocket, request: Request) => void) {
  return {
    onConnection: (socket: WebSocket, request: Request) => {
      const requestedClientId = new URL(request.url || '/', 'ws://localhost:3000').searchParams.get('clientId') || undefined
      const clientId = requestedClientId || createClientId()
      const state: ClientState = {
        id: clientId,
        socket,
        subscriptions: new Map(),
      }

      initializeScopeSubscriptions(state, getScopeFromUrl(request.url))
      clients.set(clientId, state)

      sendToClient(clientId, {
        type: 'connected',
        payload: {
          clientId,
          subscriptions: Array.from(state.subscriptions.entries()).map(([target, ids]) => ({
            target,
            ids: Array.from(ids),
          })),
          timestamp: new Date().toISOString(),
        },
      })

      socket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage

          switch (message.type) {
            case 'ping':
              sendToClient(clientId, { type: 'pong', payload: {} })
              return
            case 'subscribe':
              handleSubscriptionMessage(clientId, 'subscribe', message.payload)
              return
            case 'unsubscribe':
              handleSubscriptionMessage(clientId, 'unsubscribe', message.payload)
              return
            case 'chat':
            case 'chat_message': {
              const payload = getPayloadObject(message.payload)
              const scope: DeliveryScope = {
                sessionId: typeof payload.swarm_session_id === 'string' ? payload.swarm_session_id : typeof payload.session_id === 'string' ? payload.session_id : undefined,
                agentId: typeof payload.agent_id === 'string' ? payload.agent_id : undefined,
                taskId: typeof payload.task_id === 'string' ? payload.task_id : undefined,
              }

              broadcast({
                type: 'chat_message',
                payload: {
                  ...payload,
                  timestamp: new Date().toISOString(),
                },
              }, { excludeClientId: clientId, scope })
              return
            }
            case 'agent_status':
            case 'task_update': {
              const payload = getPayloadObject(message.payload)
              const scope: DeliveryScope = {
                sessionId: typeof payload.swarm_session_id === 'string' ? payload.swarm_session_id : undefined,
                agentId: typeof payload.agent_id === 'string' ? payload.agent_id : undefined,
                taskId: typeof payload.task_id === 'string' ? payload.task_id : undefined,
              }
              broadcast({
                type: message.type,
                payload: {
                  ...payload,
                  timestamp: new Date().toISOString(),
                },
              }, { scope })
              return
            }
            case 'internal_message': {
              const payload = getPayloadObject(message.payload)
              const scope: DeliveryScope = {
                sessionId: typeof payload.swarm_session_id === 'string' ? payload.swarm_session_id : undefined,
                agentId: typeof payload.sender_id === 'string' ? payload.sender_id : undefined,
              }
              broadcast({
                type: 'internal_message',
                payload: {
                  ...payload,
                  timestamp: new Date().toISOString(),
                },
              }, { scope })
              return
            }
            default:
              sendToClient(clientId, {
                type: 'error',
                payload: { message: `Unknown message type: ${message.type}` },
              })
          }
        } catch (error) {
          console.error('Error parsing websocket message:', error)
          sendToClient(clientId, {
            type: 'error',
            payload: { message: 'Invalid message format' },
          })
        }
      })

      socket.on('close', () => {
        clients.delete(clientId)
      })

      socket.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error)
        clients.delete(clientId)
      })

      onConnection?.(socket, request)
    }
  }
}

/**
 * 获取 WebSocket 服务器实例
 * 如果已存在则返回，否则创建新的
 */
export function getWebSocketServer(): WebSocketServer | null {
  return globalForWs.__wss || null
}

/**
 * 设置 WebSocket 服务器实例（由 server.mjs 调用）
 */
export function setWebSocketServer(wss: WebSocketServer) {
  globalForWs.__wss = wss
}

/**
 * 发布实时消息（供内部模块调用）
 */
export function publishRealtimeMessage(message: WebSocketMessage, scope?: DeliveryScope) {
  const server = getWebSocketServer()
  if (!server) {
    console.warn('[WebSocket] Server not available, message not sent:', message.type)
    return
  }
  broadcast(message, { scope })
}