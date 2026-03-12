import { WebSocketServer, WebSocket } from 'ws'

// Global WebSocket server instance
let wss: WebSocketServer | null = null

// Store client connections
const clients = new Map<string, WebSocket>()

interface WebSocketMessage {
  type: string
  payload: unknown
}

function getPayloadObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
}

function broadcast(message: WebSocketMessage, excludeClientId?: string) {
  const messageStr = JSON.stringify(message)
  clients.forEach((ws, clientId) => {
    if (clientId !== excludeClientId && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr)
    }
  })
}

function sendToClient(clientId: string, message: WebSocketMessage) {
  const ws = clients.get(clientId)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

// Initialize WebSocket server
function initWebSocketServer() {
  if (wss) return wss

  wss = new WebSocketServer({ port: 3001 })

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    clients.set(clientId, ws)

    console.log(`Client connected: ${clientId}`)

    // Send welcome message
    sendToClient(clientId, {
      type: 'connected',
      payload: { clientId, timestamp: new Date().toISOString() },
    })

    // Broadcast user joined
    broadcast(
      {
        type: 'user_joined',
        payload: { clientId, timestamp: new Date().toISOString() },
      },
      clientId
    )

    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString())
        console.log(`Received from ${clientId}:`, message)

        // Handle different message types
        switch (message.type) {
          case 'ping':
            sendToClient(clientId, { type: 'pong', payload: {} })
            break

          case 'chat':
            {
              const payload = getPayloadObject(message.payload)
            broadcast({
              type: 'chat',
              payload: {
                ...payload,
                clientId,
                timestamp: new Date().toISOString(),
              },
            })
            }
            break

          case 'agent_status':
            {
              const payload = getPayloadObject(message.payload)
            broadcast({
              type: 'agent_status',
              payload: {
                ...payload,
                timestamp: new Date().toISOString(),
              },
            })
            }
            break

          case 'task_update':
            {
              const payload = getPayloadObject(message.payload)
            broadcast({
              type: 'task_update',
              payload: {
                ...payload,
                timestamp: new Date().toISOString(),
              },
            })
            }
            break

          default:
            console.log(`Unknown message type: ${message.type}`)
        }
      } catch (error) {
        console.error('Error parsing message:', error)
        sendToClient(clientId, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        })
      }
    })

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`)
      clients.delete(clientId)

      broadcast({
        type: 'user_left',
        payload: { clientId, timestamp: new Date().toISOString() },
      })
    })

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error)
      clients.delete(clientId)
    })
  })

  console.log('WebSocket server initialized on port 3001')
  return wss
}

// Route handler to initialize WebSocket
export async function GET() {
  try {
    initWebSocketServer()
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
