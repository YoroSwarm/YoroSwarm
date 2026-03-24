/**
 * 自定义服务器 - WebSocket 和 HTTP 共用端口
 * 
 * 实现方式：
 * 1. 创建统一的 HTTP 服务器
 * 2. 将 Next.js 请求处理挂载到该服务器
 * 3. 使用 WebSocketServer 的 noServer 模式
 * 4. 手动处理 upgrade 事件来建立 WebSocket 连接
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { parse as parseUrl } from 'node:url'
import { existsSync, createReadStream } from 'node:fs'
import { join, extname } from 'node:path'
import next from 'next'
import { WebSocketServer, WebSocket } from 'ws'

const require = createRequire(import.meta.url)

// ============ 配置 ============
const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)
const accessCode = process.env.ACCESS_CODE || randomBytes(4).toString('hex').toUpperCase()

// Set as environment variable so Next.js API routes can access it
process.env.ACCESS_CODE = accessCode

console.log(`🔧 Mode: ${dev ? 'development' : 'production'}`)
console.log(`🔑 Access Code: ${accessCode}\n`)

// ============ Prisma 迁移 ============
async function runPrismaCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [require.resolve('prisma/build/index.js'), command, ...args],
      { stdio: 'inherit', env: process.env }
    )
    proc.on('exit', (code, signal) => {
      if (signal) reject(new Error(`Prisma ${command} terminated with signal ${signal}`))
      else if (code !== 0) reject(new Error(`Prisma ${command} exited with code ${code}`))
      else resolve(undefined)
    })
  })
}

console.log('📦 Generating Prisma client...')
try {
  await runPrismaCommand('generate', [])
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error)
  process.exit(1)
}

console.log('🗄️  Ensuring database schema is up to date...')
try {
  await runPrismaCommand('migrate', ['deploy'])
} catch (error) {
  console.error('❌ Failed to initialize database schema:', error)
  process.exit(1)
}

// ============ 沙盒环境检测 ============
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'

function detectSandboxDeps() {
  const os = platform()
  console.log(`🔒 Sandbox: Detecting capabilities (${os})...`)

  if (os === 'darwin') {
    const toolPath = '/usr/bin/sandbox-exec'
    if (existsSync(toolPath)) {
      try {
        execFileSync(toolPath, ['-p', '(version 1)(allow default)', '/usr/bin/true'], {
          timeout: 5000, stdio: 'pipe',
        })
        console.log('🔒 Sandbox: ✅ macOS Seatbelt (sandbox-exec) available')
        return
      } catch {
        console.warn('🔒 Sandbox: ⚠️  sandbox-exec found but failed verification')
      }
    }
    console.warn('🔒 Sandbox: ⚠️  sandbox-exec not available — commands will run without OS-level isolation')
  } else if (os === 'linux') {
    const candidates = ['/usr/bin/bwrap', '/usr/local/bin/bwrap']
    for (const p of candidates) {
      if (existsSync(p)) {
        console.log(`🔒 Sandbox: ✅ Bubblewrap (bwrap) available at ${p}`)
        return
      }
    }
    try {
      const result = execFileSync('which', ['bwrap'], { timeout: 5000, stdio: 'pipe' })
      if (result.toString().trim()) {
        console.log('🔒 Sandbox: ✅ Bubblewrap (bwrap) available')
        return
      }
    } catch { /* not found */ }
    console.warn('🔒 Sandbox: ⚠️  bwrap not found — install with: apt install bubblewrap')
    console.warn('🔒 Sandbox: ⚠️  Commands will run without OS-level isolation')
  } else {
    console.warn(`🔒 Sandbox: ⚠️  Unsupported platform (${os}) — commands will run without OS-level isolation`)
  }
}

detectSandboxDeps()

// ============ Next.js 应用 ============
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// ============ WebSocket 状态管理 ============
const globalForWs = globalThis

if (!globalForWs.__wsClients) {
  globalForWs.__wsClients = new Map()
}
if (!globalForWs.__wss) {
  globalForWs.__wss = null
}

const clients = globalForWs.__wsClients

// ============ WebSocket 辅助函数 ============
function createClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function getPayloadObject(payload) {
  return typeof payload === 'object' && payload !== null ? payload : {}
}

function ensureSubscriptionSet(state, target) {
  let values = state.subscriptions.get(target)
  if (!values) {
    values = new Set()
    state.subscriptions.set(target, values)
  }
  return values
}

function subscribe(state, target, id) {
  const values = ensureSubscriptionSet(state, target)
  values.add(id || '*')
}

function unsubscribe(state, target, id) {
  const values = state.subscriptions.get(target)
  if (!values) return
  values.delete(id || '*')
  if (values.size === 0) {
    state.subscriptions.delete(target)
  }
}

function hasSubscription(state, target, id) {
  const values = state.subscriptions.get(target)
  if (!values || values.size === 0) return false
  return values.has('*') || (!!id && values.has(id))
}

function getScopeFromUrl(rawUrl) {
  if (!rawUrl) return {}
  const url = new URL(rawUrl, 'ws://localhost')
  const segments = url.pathname.split('/').filter(Boolean)
  const scope = {
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

function initializeScopeSubscriptions(state, scope) {
  if (scope.sessionId) subscribe(state, 'session', scope.sessionId)
  if (scope.agentId) subscribe(state, 'agent', scope.agentId)
  if (scope.taskId) subscribe(state, 'task', scope.taskId)
}

function sendToClient(clientId, message) {
  const state = clients.get(clientId)
  if (!state || state.socket.readyState !== WebSocket.OPEN) return
  state.socket.send(JSON.stringify(message))
}

function shouldDeliver(state, scope) {
  if (!scope) {
    return state.subscriptions.size === 0 || hasSubscription(state, 'all')
  }
  if (hasSubscription(state, 'all')) return true
  if (scope.sessionId && hasSubscription(state, 'session', scope.sessionId)) return true
  if (scope.agentId && hasSubscription(state, 'agent', scope.agentId)) return true
  if (scope.taskId && hasSubscription(state, 'task', scope.taskId)) return true
  return false
}

function broadcast(message, options = {}) {
  const messageStr = JSON.stringify(message)
  clients.forEach((state, clientId) => {
    if (clientId === options.excludeClientId) return
    if (state.socket.readyState !== WebSocket.OPEN) return
    if (!shouldDeliver(state, options.scope)) return
    state.socket.send(messageStr)
  })
}

function normalizeSubscriptionTarget(value) {
  const valid = ['all', 'session', 'agent', 'task', 'all_agents', 'all_tasks']
  return valid.includes(value) ? value : null
}

function handleSubscriptionMessage(clientId, type, payload) {
  const state = clients.get(clientId)
  if (!state) return

  const parsed = getPayloadObject(payload)
  const target = normalizeSubscriptionTarget(parsed.target)
  const id = typeof parsed.id === 'string' ? parsed.id : undefined

  if (!target) {
    sendToClient(clientId, { type: 'error', payload: { message: 'Invalid subscription target' } })
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

// ============ 初始化 WebSocket 服务器 ============
function initializeWebSocketServer(server) {
  if (globalForWs.__wss) return globalForWs.__wss

  // 使用 noServer 模式，手动处理 upgrade
  const wss = new WebSocketServer({ noServer: true })
  globalForWs.__wss = wss

  wss.on('connection', (socket, request) => {
    const requestedClientId = new URL(request.url || '/', 'ws://localhost').searchParams.get('clientId') || undefined
    const clientId = requestedClientId || createClientId()
    const state = {
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

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())

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
            const scope = {
              sessionId: payload.swarm_session_id || payload.session_id,
              agentId: payload.agent_id,
              taskId: payload.task_id,
            }
            broadcast({
              type: 'chat_message',
              payload: { ...payload, timestamp: new Date().toISOString() },
            }, { excludeClientId: clientId, scope })
            return
          }
          case 'agent_status':
          case 'task_update': {
            const payload = getPayloadObject(message.payload)
            const scope = {
              sessionId: payload.swarm_session_id,
              agentId: payload.agent_id,
              taskId: payload.task_id,
            }
            broadcast({
              type: message.type,
              payload: { ...payload, timestamp: new Date().toISOString() },
            }, { scope })
            return
          }
          case 'internal_message': {
            const payload = getPayloadObject(message.payload)
            const scope = {
              sessionId: payload.swarm_session_id,
              agentId: payload.sender_id,
            }
            broadcast({
              type: 'internal_message',
              payload: { ...payload, timestamp: new Date().toISOString() },
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
        sendToClient(clientId, { type: 'error', payload: { message: 'Invalid message format' } })
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

  // 处理 HTTP upgrade 请求
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parseUrl(request.url)

    // 只处理 /ws 路径的 WebSocket 升级请求
    // 其他路径（如 /_next/webpack-hmr）留给 Next.js 处理
    if (pathname.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    }
    // 注意：不要销毁 socket，让 Next.js 处理 HMR WebSocket
  })

  console.log(`📡 WebSocket server attached to HTTP server`)
  return wss
}

// ============ 导出供 API 路由使用 ============
// 发布到全局，确保 route.ts 能访问同一个实例
// 注意：必须在 initializeWebSocketServer 之后执行
globalThis.__publishRealtimeMessage = function(message, scope) {
  broadcast(message, { scope })
}

// ============ 静态文件服务（生产模式） ============
// 生产模式下，Next.js 从 dist/ 提供静态文件，但头像/背景上传到 public/avatars/ 和 public/backgrounds/
// 需要手动处理这些路径
const mimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

function serveStaticFile(req, res, baseDir) {
  const pathname = parseUrl(req.url).pathname
  // 提取文件名：/xxx/yyy.png -> yyy.png
  const segments = pathname.split('/').filter(Boolean)
  const filename = segments[segments.length - 1]
  const filePath = join(process.cwd(), 'public', baseDir, filename)

  if (!existsSync(filePath)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }

  const ext = extname(filename).toLowerCase()
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

  const fileStream = createReadStream(filePath)
  fileStream.pipe(res)
}

// ============ 启动服务器 ============
await app.prepare()

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parseUrl(req.url, true)
    const pathname = parsedUrl.pathname

    // 生产模式下处理 /avatars/* 和 /backgrounds/* 静态文件
    if (!dev) {
      if (pathname.startsWith('/avatars/')) {
        serveStaticFile(req, res, 'avatars')
        return
      }
      if (pathname.startsWith('/backgrounds/')) {
        serveStaticFile(req, res, 'backgrounds')
        return
      }
    }

    await handle(req, res, parsedUrl)
  } catch (err) {
    console.error('Error handling request:', err)
    res.statusCode = 500
    res.end('Internal server error')
  }
})

// 初始化 WebSocket（挂载到同一个 HTTP 服务器）
initializeWebSocketServer(server)

server.listen(port, hostname, (err) => {
  if (err) throw err
  console.log(`\n🚀 Server ready at http://${hostname}:${port}`)
  console.log(`   WebSocket endpoint: ws://${hostname}:${port}/ws`)
  console.log(`   WebSocket clients: ${clients.size}\n`)
})

// ============ 优雅关闭 ============
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`)

  // 关闭 WebSocket 服务器
  if (globalForWs.__wss) {
    console.log('📡 Closing WebSocket server...')
    globalForWs.__wss.clients.forEach((client) => {
      client.close(1001, 'Server shutting down')
    })
    globalForWs.__wss.close()
  }

  // 关闭 HTTP 服务器
  server.close(() => {
    console.log('🚀 HTTP server closed')
    process.exit(0)
  })

  // 强制退出超时
  setTimeout(() => {
    console.error('⚠️  Force shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
