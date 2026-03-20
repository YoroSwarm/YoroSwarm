import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Swarm API - Session Scoped Multi-Agent Edition',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'User login',
        'POST /api/auth/logout': 'User logout',
        'POST /api/auth/refresh': 'Refresh access token',
        'GET  /api/auth/me': 'Get current user info',
        'GET  /api/auth/access-code': 'Get access code info',
        'POST /api/auth/access-code': 'Rotate access code',
      },
      swarm_sessions: {
        'GET  /api/swarm-sessions': 'List current user swarm sessions',
        'POST /api/swarm-sessions': 'Create new swarm session',
        'GET  /api/swarm-sessions/{id}': 'Get swarm session detail',
        'PATCH /api/swarm-sessions/{id}': 'Update swarm session',
        'DELETE /api/swarm-sessions/{id}': 'Archive swarm session',
        'GET  /api/swarm-sessions/{id}/monitor': 'Get session monitor summary',
        'GET  /api/swarm-sessions/{id}/external/messages': 'List external user <-> lead messages',
        'POST /api/swarm-sessions/{id}/external/messages': 'Send user message to session lead',
        'GET  /api/swarm-sessions/{id}/tasks': 'List session tasks',
        'POST /api/swarm-sessions/{id}/tasks': 'Create session task',
      },
      agents: {
        'GET  /api/agents?swarmSessionId={id}': 'List agents by swarm session',
        'POST /api/agents': 'Create session-scoped agent',
      },
      tasks: {
        'GET  /api/tasks?swarmSessionId={id}': 'List tasks by swarm session',
        'POST /api/tasks': 'Create task in an existing swarm session',
        'GET  /api/tasks/ready/list?swarmSessionId={id}': 'List ready tasks in a swarm session',
      },
      files: {
        'GET  /api/files?swarmSessionId={id}': 'List session files',
        'POST /api/files': 'Upload file into a swarm session (multipart/form-data)',
      },
      websocket: {
        'GET  /api/ws': 'WebSocket server info (deprecated, use /ws directly)',
        'WS   ws://localhost:3000/ws/sessions/{id}': 'Session realtime stream',
        'WS   ws://localhost:3000/ws/agents/{id}': 'Agent realtime stream',
        'WS   ws://localhost:3000/ws/tasks/{id}': 'Task realtime stream',
      },
      sandbox: {
        'GET  /api/sandbox': 'Get platform sandbox capability status (public)',
        'GET  /api/sessions/{id}/sandbox': 'Get session sandbox config and status',
        'PATCH /api/sessions/{id}/sandbox': 'Update session sandbox policy',
        'DELETE /api/sessions/{id}/sandbox': 'Reset session sandbox config to defaults',
      },
    },
    docs: {
      response_format: 'All API responses follow { success: boolean, data?: T, error?: string, message?: string }',
      authentication: 'Use Cookie-based JWT authentication (access_token and refresh_token cookies)',
    },
  })
}
