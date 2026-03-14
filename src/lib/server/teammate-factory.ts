import { AgentKind } from '@prisma/client'
import prisma from '@/lib/db'
import { publishRealtimeMessage } from '@/app/api/ws/route'
import { appendAgentContextEntry } from '@/lib/server/agent-context'
import { createInternalThread, sendInternalMessage } from '@/lib/server/internal-bus'
import { initCognitiveTeammate } from '@/lib/server/cognitive-teammate-runner'

/**
 * Teammate 创建输入 - 完全由 Lead 控制
 * 系统不做任何预设或限制
 */
export interface CreateTeammateInput {
  swarmSessionId: string
  createdById: string

  name: string
  role: string
  description: string
  capabilities: string[]
  kind?: AgentKind

  taskContext?: {
    taskId: string
    taskTitle: string
    taskDescription?: string
  }

  config?: Record<string, unknown>
}

/**
 * 根据 role 推断 AgentKind（仅用于数据库分类，不影响功能）
 */
export function inferAgentKind(role: string): AgentKind {
  const r = role.toLowerCase()
  if (r.includes('lead')) return 'LEAD'
  if (r.includes('research')) return 'RESEARCHER'
  if (r.includes('writ') || r.includes('document')) return 'WRITER'
  if (r.includes('analy') || r.includes('analys')) return 'ANALYST'
  if (r.includes('engineer') || r.includes('code') || r.includes('dev')) return 'ENGINEER'
  if (r.includes('coordinat')) return 'COORDINATOR'
  if (r.includes('specialist') || r.includes('expert')) return 'SPECIALIST'
  return 'WORKER'
}

/**
 * 生成唯一名称
 */
async function generateUniqueName(swarmSessionId: string, baseName: string): Promise<string> {
  const existingAgents = await prisma.agent.findMany({
    where: { swarmSessionId },
    select: { name: true },
  })
  const existingNames = new Set(existingAgents.map(a => a.name))

  if (!existingNames.has(baseName)) {
    return baseName
  }

  let counter = 1
  let name = `${baseName}-${counter}`
  while (existingNames.has(name)) {
    counter++
    name = `${baseName}-${counter}`
  }
  return name
}

/**
 * 创建 teammate - 完全由 Lead 定义所有属性
 */
export async function createTeammate(input: CreateTeammateInput) {
  const uniqueName = await generateUniqueName(input.swarmSessionId, input.name)
  const kind = input.kind || inferAgentKind(input.role)

  const agent = await prisma.agent.create({
    data: {
      swarmSessionId: input.swarmSessionId,
      name: uniqueName,
      role: input.role,
      kind,
      description: input.description,
      capabilities: JSON.stringify(input.capabilities),
      status: 'IDLE',
      config: JSON.stringify({
        provisionedBy: 'lead_orchestrator',
        createdById: input.createdById,
        createdAt: new Date().toISOString(),
        customConfig: input.config || {},
      }),
    },
  })

  // 初始化 teammate 上下文
  await appendAgentContextEntry({
    swarmSessionId: input.swarmSessionId,
    agentId: agent.id,
    sourceType: 'system',
    entryType: 'system_bootstrap',
    content: `你是 ${uniqueName}，角色是 ${input.role}。\n\n${input.description}\n\n能力：${input.capabilities.join(', ')}`,
    metadata: {
      createdById: input.createdById,
      capabilities: input.capabilities,
    },
  })

  // 任务上下文
  if (input.taskContext) {
    await appendAgentContextEntry({
      swarmSessionId: input.swarmSessionId,
      agentId: agent.id,
      sourceType: 'task',
      sourceId: input.taskContext.taskId,
      entryType: 'task_brief',
      content: `任务：${input.taskContext.taskTitle}\n\n${input.taskContext.taskDescription || ''}`.trim(),
      metadata: { taskId: input.taskContext.taskId },
    })
  }

  await initCognitiveTeammate(input.swarmSessionId, agent.id, input.createdById)

  // 创建内部线程
  const thread = await createInternalThread({
    swarmSessionId: input.swarmSessionId,
    threadType: 'lead_teammate',
    subject: `${uniqueName} 协作线程`,
    relatedTaskId: input.taskContext?.taskId,
  })

  // Lead 发送欢迎消息
  await sendInternalMessage({
    swarmSessionId: input.swarmSessionId,
    threadId: thread.id,
    senderAgentId: input.createdById,
    recipientAgentId: agent.id,
    messageType: 'welcome',
    content: `欢迎加入，${uniqueName}。我是 Team Lead。\n\n你的角色：${input.role}\n${input.description}`,
  })

  // 广播
  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: agent.id,
        name: agent.name,
        status: 'idle',
        kind: kind.toLowerCase(),
        role: agent.role,
        swarm_session_id: input.swarmSessionId,
        message: `Teammate ${uniqueName} 已创建 (${input.role})`,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: input.swarmSessionId }
  )

  return { agent, thread }
}

/**
 * 批量创建
 */
export async function createTeammatesBatch(
  swarmSessionId: string,
  leadAgentId: string,
  definitions: Omit<CreateTeammateInput, 'swarmSessionId' | 'createdById'>[]
) {
  const results = await Promise.all(
    definitions.map(def =>
      createTeammate({
        ...def,
        swarmSessionId,
        createdById: leadAgentId,
      })
    )
  )

  return {
    agents: results.map(r => r.agent),
    threads: results.map(r => r.thread),
    count: results.length,
  }
}

/**
 * 回收 teammate
 */
export async function recycleTeammate(swarmSessionId: string, agentId: string, leadAgentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { tasks: true },
  })

  if (!agent || agent.swarmSessionId !== swarmSessionId) {
    throw new Error('AGENT_NOT_FOUND')
  }

  const activeTasks = agent.tasks.filter(t =>
    t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  )

  if (activeTasks.length > 0) {
    throw new Error('AGENT_HAS_ACTIVE_TASKS')
  }

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      status: 'OFFLINE',
      config: JSON.stringify({
        ...JSON.parse(agent.config || '{}'),
        recycledAt: new Date().toISOString(),
        recycledBy: leadAgentId,
      }),
    },
  })

  publishRealtimeMessage(
    {
      type: 'agent_status',
      payload: {
        agent_id: agent.id,
        name: agent.name,
        status: 'offline',
        message: `Teammate ${agent.name} 已回收`,
        swarm_session_id: swarmSessionId,
        timestamp: new Date().toISOString(),
      },
    },
    { sessionId: swarmSessionId }
  )

  return updated
}

/**
 * 获取活跃 teammates
 */
export async function getActiveTeammates(swarmSessionId: string) {
  return prisma.agent.findMany({
    where: {
      swarmSessionId,
      role: { not: 'team_lead' },
      status: { not: 'OFFLINE' },
    },
    include: {
      tasks: {
        where: {
          status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}
