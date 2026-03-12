import { WebSocketServer, WebSocket } from 'ws'

type WebSocketMessage = {
  type: string
  payload: unknown
  message_id?: string
  requires_ack?: boolean
}

type SubscriptionTarget =
  | 'all'
  | 'conversation'
  | 'team'
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
  conversationId?: string
  teamId?: string
  sessionId?: string
}

let wss: WebSocketServer | null = null
const clients = new Map<string, ClientState>()

function getPayloadObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
}

function createClientId() {
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

function subscribe(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = ensureSubscriptionSet(state, target)
  values.add(id || '*')
}

function unsubscribe(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = state.subscriptions.get(target)
  if (!values) return

  values.delete(id || '*')
  if (values.size === 0) {
    state.subscriptions.delete(target)
  }
}

function hasSubscription(state: ClientState, target: SubscriptionTarget, id?: string) {
  const values = state.subscriptions.get(target)
  if (!values || values.size === 0) return false
  return values.has('*') || (!!id && values.has(id))
}

function getScopeFromUrl(rawUrl?: string | null): DeliveryScope {
  if (!rawUrl) return {}

  const url = new URL(rawUrl, 'ws://localhost:3001')
  const segments = url.pathname.split('/').filter(Boolean)
  const scope: DeliveryScope = {
    conversationId: url.searchParams.get('conversationId') || undefined,
    teamId: url.searchParams.get('teamId') || undefined,
    sessionId: url.searchParams.get('sessionId') || undefined,
  }

  if (segments[0] === 'ws' && segments.length >= 3) {
    const [, target, id] = segments
    if (target === 'teams') scope.teamId = id
    if (target === 'sessions') scope.sessionId = id
    if (target === 'conversations') scope.conversationId = id
  }

  return scope
}

function initializeScopeSubscriptions(state: ClientState, scope: DeliveryScope) {
  if (scope.conversationId) subscribe(state, 'conversation', scope.conversationId)
  if (scope.teamId) subscribe(state, 'team', scope.teamId)
  if (scope.sessionId) subscribe(state, 'session', scope.sessionId)
}

function sendToClient(clientId: string, message: WebSocketMessage) {
  const state = clients.get(clientId)
  if (!state || state.socket.readyState !== WebSocket.OPEN) return
  state.socket.send(JSON.stringify(message))
}

function shouldDeliver(state: ClientState, scope?: DeliveryScope) {
  if (!scope) {
    return state.subscriptions.size === 0 || hasSubscription(state, 'all')
  }

  const isExplicitlyScoped = state.subscriptions.size > 0
  if (!isExplicitlyScoped) return true
  if (hasSubscription(state, 'all')) return true
  if (scope.conversationId && hasSubscription(state, 'conversation', scope.conversationId)) return true
  if (scope.teamId && hasSubscription(state, 'team', scope.teamId)) return true
  if (scope.sessionId && hasSubscription(state, 'session', scope.sessionId)) return true
  return false
}

function broadcast(message: WebSocketMessage, options?: { excludeClientId?: string; scope?: DeliveryScope }) {
  const messageStr = JSON.stringify(message)
  clients.forEach((state, clientId) => {
    if (clientId === options?.excludeClientId) return
    if (state.socket.readyState !== WebSocket.OPEN) return
    if (!shouldDeliver(state, options?.scope)) return
    state.socket.send(messageStr)
  })
}

function normalizeSubscriptionTarget(value: unknown): SubscriptionTarget | null {
  switch (value) {
    case 'all':
    case 'conversation':
    case 'team':
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

function handleSubscriptionMessage(clientId: string, type: 'subscribe' | 'unsubscribe', payload: unknown) {
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

export function ensureWebSocketServer() {
  if (wss) return wss

  wss = new WebSocketServer({ port: 3001 })

  wss.on('connection', (socket: WebSocket, request) => {
    const requestedClientId = new URL(request.url || '/', 'ws://localhost:3001').searchParams.get('clientId') || undefined
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
              conversationId: typeof payload.conversation_id === 'string' ? payload.conversation_id : undefined,
              teamId: typeof payload.team_id === 'string' ? payload.team_id : undefined,
              sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
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
            broadcast({
              type: message.type,
              payload: {
                ...payload,
                timestamp: new Date().toISOString(),
              },
            })
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
  })

  return wss
}

export function publishRealtimeMessage(message: WebSocketMessage, scope?: DeliveryScope) {
  ensureWebSocketServer()
  broadcast(message, { scope })
}

export function publishConversationMessage(payload: Record<string, unknown> & { conversation_id: string }) {
  publishRealtimeMessage(
    {
      type: 'chat_message',
      payload,
    },
    { conversationId: payload.conversation_id }
  )
}

export async function GET() {
  try {
    ensureWebSocketServer()

    return new Response(
      JSON.stringify({
        status: 'WebSocket server running',
        port: 3001,
        clients: clients.size,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('WebSocket init error:', error)
    return new Response(JSON.stringify({ error: 'Failed to initialize WebSocket' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
