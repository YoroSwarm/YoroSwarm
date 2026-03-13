function parseJson(value: string | null | undefined) {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function serializeExternalMessage(message: {
  id: string;
  swarmSessionId: string;
  senderType: string;
  senderId: string | null;
  content: string;
  messageType: string;
  metadata: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    swarm_session_id: message.swarmSessionId,
    sender_type: message.senderType as 'user' | 'lead',
    sender_id: message.senderId || undefined,
    content: message.content,
    message_type: message.messageType,
    metadata: parseJson(message.metadata),
    created_at: message.createdAt.toISOString(),
  };
}

export function serializeSwarmSession(
  session: ({
    id: string;
    title: string;
    goal: string | null;
    status: { toLowerCase(): string };
    mode: string;
    leadAgentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
  } & {
    agents?: Array<{
      id: string;
      name: string;
      role: string;
      kind: string;
      status: string;
      description: string | null;
      capabilities: string | null;
      createdAt: Date;
      updatedAt: Date;
      swarmSessionId: string;
    }>;
    tasks?: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      priority: number;
      assigneeId: string | null;
      createdAt: Date;
      updatedAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      dueDate: Date | null;
    }>;
    externalConversations?: Array<{
      id: string;
      messages?: Array<{
        id: string;
              swarmSessionId: string;
        senderType: string;
        senderId: string | null;
        content: string;
        messageType: string;
        metadata: string | null;
        createdAt: Date;
      }>;
    }>;
  }) | null
) {
  if (!session) return null;

  const conversation = session.externalConversations?.[0];
  const lastMessage = conversation?.messages?.[0];

  return {
    id: session.id,
    title: session.title,
    goal: session.goal || undefined,
    status: session.status.toLowerCase(),
    mode: session.mode,
    lead_agent_id: session.leadAgentId || undefined,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
    archived_at: session.archivedAt?.toISOString(),
    last_message: lastMessage ? serializeExternalMessage(lastMessage) : undefined,
    agents: (session.agents || []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      kind: agent.kind.toLowerCase(),
      status: agent.status.toLowerCase(),
      description: agent.description || undefined,
      capabilities: agent.capabilities ? JSON.parse(agent.capabilities) : [],
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
      swarm_session_id: agent.swarmSessionId,
    })),
    tasks: (session.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      status: task.status.toLowerCase(),
      priority: task.priority >= 3 ? 'high' : task.priority <= 1 ? 'low' : 'medium',
      assigned_agent_id: task.assigneeId || undefined,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      started_at: task.startedAt?.toISOString(),
      completed_at: task.completedAt?.toISOString(),
      deadline: task.dueDate?.toISOString(),
    })),
  };
}
