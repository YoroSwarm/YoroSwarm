import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Swarm API - Next.js Full Stack Edition',
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
      teams: {
        'GET  /api/teams': 'List all teams',
        'POST /api/teams': 'Create new team',
      },
      agents: {
        'GET  /api/agents': 'List all agents',
        'GET  /api/agents?teamId={id}': 'List agents by team',
        'POST /api/agents': 'Create new agent',
      },
      messages: {
        'GET  /api/messages': 'List messages',
        'GET  /api/messages?conversationId={id}': 'List messages by conversation',
        'POST /api/messages': 'Send new message',
      },
      tasks: {
        'GET  /api/tasks': 'List all tasks',
        'GET  /api/tasks?status={status}': 'List tasks by status',
        'GET  /api/tasks?assigneeId={id}': 'List tasks by assignee',
        'POST /api/tasks': 'Create new task',
      },
      files: {
        'GET  /api/files': 'List user files',
        'POST /api/files': 'Upload file (multipart/form-data)',
      },
      llm: {
        'POST /api/llm': 'Send message to LLM',
      },
      websocket: {
        'GET  /api/ws': 'WebSocket server info',
        'WS   ws://localhost:3001': 'WebSocket endpoint (port 3001)',
      },
    },
    docs: {
      response_format: 'All API responses follow { success: boolean, data?: T, error?: string, message?: string }',
      authentication: 'Use Cookie-based JWT authentication (access_token and refresh_token cookies)',
    },
  })
}
