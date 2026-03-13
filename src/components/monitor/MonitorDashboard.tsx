'use client';

import React, { useMemo, useState } from 'react';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { AgentList } from './AgentList';
import { CreateSwarmSessionModal } from './CreateSwarmSessionModal';
import { RealTimeMonitor } from './RealTimeMonitor';
import { TaskAssignment } from './TaskAssignment';
import { SessionOverview } from './TeamOverview';
import { useSwarmTeam } from '@/hooks/use-swarm-team';
import { useTasks } from '@/hooks/use-tasks';
import { useAgentWebSocket } from '@/hooks/use-agent-websocket';
import type { Agent, AgentActivity, AgentMessage, Task } from '@/types/agent';

const defaultActivities: AgentActivity[] = [
  {
    id: 'activity-1',
    agentId: 'team-lead',
    agentName: 'Team Lead',
    action: 'team_bootstrap',
    details: 'Lead 已接管会话，正在评估目标、拆解任务并决定是否扩编 teammate。',
    timestamp: new Date().toISOString(),
  },
];

const defaultMessages: AgentMessage[] = [
  {
    id: 'message-1',
    agentId: 'team-lead',
    agentName: 'Team Lead',
    content: 'Swarm 已初始化。Lead 会根据目标动态拆解任务并调用合适队友。',
    type: 'system',
    timestamp: new Date().toISOString(),
  },
];

export const MonitorDashboard: React.FC = () => {
  const {
    teams,
    currentTeam,
    currentTeamId,
    currentSessionCard,
    agents,
    isLoading: isTeamLoading,
    error: teamError,
    setCurrentTeamId,
    createSwarmSession,
  } = useSwarmTeam();
  const {
    tasks,
    isLoading: isTasksLoading,
    error: tasksError,
    assignTask,
    updateTaskStatus,
  } = useTasks({ swarmSessionId: currentTeamId || undefined, autoLoad: Boolean(currentTeamId) });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const {
    isConnected,
    tasks: liveTasks,
    agents: liveAgents,
    internalMessages: liveInternalMessages,
  } = useAgentWebSocket({
    swarmSessionId: currentTeamId || undefined,
    autoConnect: Boolean(currentTeamId),
  });

  // 合并所有实时消息：任务更新、agent 状态、内部消息
  const messages = useMemo(() => {
    const hasLiveData = liveTasks.size > 0 || liveAgents.size > 0 || liveInternalMessages.length > 0;

    if (!hasLiveData && !currentTeamId) {
      return defaultMessages;
    }

    const taskMessages = Array.from(liveTasks.values()).map((update) => ({
      id: `task-message-${update.task_id}-${update.timestamp}`,
      agentId: update.assignee_id || 'team-lead',
      agentName: update.assignee_name || 'Team Lead',
      content: update.message || `${update.title} 状态已更新为 ${update.status}`,
      type: 'system' as const,
      timestamp: update.timestamp,
    }));

    const agentMessages = Array.from(liveAgents.values()).map((update) => ({
      id: `agent-message-${update.agent_id}-${update.timestamp}`,
      agentId: update.agent_id,
      agentName: update.name,
      content: update.message || `${update.name} 状态: ${update.status}`,
      type: 'system' as const,
      timestamp: update.timestamp,
    }));

    const internalMsgs = liveInternalMessages.map((msg) => ({
      id: `internal-message-${msg.message_id}-${msg.timestamp}`,
      agentId: msg.sender_id,
      agentName: msg.sender_name,
      content: `[内部] ${msg.recipient_name ? `→ ${msg.recipient_name}: ` : ''}${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`,
      type: 'message' as const,
      timestamp: msg.timestamp,
    }));

    return [...taskMessages, ...agentMessages, ...internalMsgs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
  }, [liveAgents, liveTasks, liveInternalMessages, currentTeamId]);

  const leadAgent = useMemo(
    () => agents.find((agent) => agent.type === 'leader') || null,
    [agents]
  );

  const teammates = useMemo(
    () => agents.filter((agent) => agent.type !== 'leader'),
    [agents]
  );

  const activities = useMemo(() => {
    if (!currentTeam) return defaultActivities;

    const liveActivities = [
      ...Array.from(liveTasks.values()).map((update) => ({
        id: `task-activity-${update.task_id}-${update.timestamp}`,
        agentId: update.assignee_id || 'team-lead',
        agentName: update.assignee_name || 'Team Lead',
        action: 'task_update',
        details: update.message || `${update.title} 状态: ${update.status}`,
        timestamp: update.timestamp,
      })),
      ...Array.from(liveAgents.values()).map((update) => ({
        id: `agent-activity-${update.agent_id}-${update.timestamp}`,
        agentId: update.agent_id,
        agentName: update.name,
        action: 'agent_status',
        details: update.message || `${update.name} 状态: ${update.status}`,
        timestamp: update.timestamp,
      })),
      ...liveInternalMessages.map((msg) => ({
        id: `internal-activity-${msg.message_id}-${msg.timestamp}`,
        agentId: msg.sender_id,
        agentName: msg.sender_name,
        action: 'internal_message',
        details: `内部消息${msg.recipient_name ? ` → ${msg.recipient_name}` : ''}: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? '...' : ''}`,
        timestamp: msg.timestamp,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (liveActivities.length > 0) {
      return liveActivities.slice(0, 15);
    }

    return [
      {
        id: `${currentTeam.id}-lead`,
        agentId: leadAgent?.id || 'team-lead',
        agentName: leadAgent?.name || 'Team Lead',
        action: 'lead_active',
        details: 'Lead 正在维护团队状态、评估进度并按任务需要动态创建或调度 teammate。',
        timestamp: new Date().toISOString(),
      },
    ];
  }, [currentTeam, leadAgent, liveAgents, liveTasks, liveInternalMessages]);

  const isLoading = isTeamLoading || isTasksLoading;
  const error = teamError || tasksError;

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
  };

  const handleCreateSwarmSession = async () => {
    await createSwarmSession();
    setIsCreateModalOpen(false);
  };

  const handleAssignTask = async (taskId: string, agentId: string | undefined) => {
    try {
      await assignTask(taskId, agentId);
    } catch (err) {
      console.error('分配任务失败:', err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: Task['status']) => {
    try {
      await updateTaskStatus(taskId, status);
    } catch (err) {
      console.error('更新任务状态失败:', err);
    }
  };

  const agentMessages = selectedAgent
    ? messages.filter((message) => message.agentId === selectedAgent.id)
    : [];
  const agentActivities = selectedAgent
    ? activities.filter((activity) => activity.agentId === selectedAgent.id)
    : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(244,244,245,0.95)_30%,rgba(228,228,231,1)_100%)] px-4 py-6 text-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-4xl border border-white/40 bg-white/65 shadow-[0_24px_80px_rgba(15,15,15,0.08)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.26em] text-neutral-500">
                Swarm Control Surface
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 lg:text-4xl">Team Lead 驱动的 Agent 集群</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 lg:text-base">
                  面向单用户的通用办公 Agent 系统。创建会话后先由 Lead 接管，再根据任务需要动态创建队友、并行推进并持续调整团队结构。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {error ? <div className="text-sm text-red-600">错误: {error}</div> : null}
              {isLoading ? <div className="text-sm text-neutral-500">正在同步会话状态...</div> : null}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
              >
                新对话
              </button>
            </div>
          </div>

          <div className="border-t border-border bg-muted/30 px-6 py-4 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Active Sessions</span>
              {teams.length === 0 ? (
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">尚未创建会话</span>
              ) : (
                teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setCurrentTeamId(team.id)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      currentTeamId === team.id
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    {team.title}
                  </button>
                ))
              )}
            </div>
          </div>
        </header>

        {currentSessionCard ? (
          <>
            <SessionOverview session={currentSessionCard} onSessionUpdate={() => {}} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Lead</h2>
                      <p className="mt-1 text-sm text-muted-foreground">用户只与 Lead 对话。Lead 负责创建团队、协调任务和管理整体进度。</p>
                    </div>
                    <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">1 lead</div>
                  </div>
                  {leadAgent ? (
                    <AgentList
                      agents={[leadAgent]}
                      onAgentClick={handleAgentClick}
                      selectedAgentId={selectedAgent?.id}
                    />
                  ) : (
                    <div className="rounded-2xl border border-border bg-muted/50 px-5 py-10 text-center text-sm text-muted-foreground">
                      Lead 初始化中。
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Teammates</h2>
                      <p className="mt-1 text-sm text-muted-foreground">队友由 Lead 按需动态创建。用户在监控页查看状态，但外部沟通只通过该会话 Lead。</p>
                    </div>
                    <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{teammates.length} teammates</div>
                  </div>
                  {teammates.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 px-5 py-10 text-center text-sm text-muted-foreground">
                      当前仅有 Lead 会话上下文，尚未创建 teammate。
                    </div>
                  ) : (
                    <AgentList
                      agents={teammates}
                      onAgentClick={handleAgentClick}
                      selectedAgentId={selectedAgent?.id}
                    />
                  )}
                </section>

                <section className="rounded-2xl border border-border bg-muted p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground">系统设计对齐</h2>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div>Lead 负责创建团队、协调任务和动态增减队员。</div>
                    <div>Teammates 保持独立上下文，适合并行搜集、撰写、分析和编码。</div>
                    <div>用户外部消息统一进入 Lead，上下文传播通过任务 brief 和内部消息完成。</div>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <RealTimeMonitor
                  activities={activities}
                  messages={messages}
                  isConnected={isConnected}
                />

                <TaskAssignment
                  agents={teammates}
                  tasks={tasks}
                  onAssignTask={handleAssignTask}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                />
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-2xl border border-border bg-card px-8 py-14 text-center shadow-sm">
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">No Session Yet</p>
              <h2 className="mt-3 text-3xl font-semibold text-foreground">开始一个新对话</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                交互上接近传统 AI Chat。先创建一个 Lead 会话，然后直接发送首条消息，后续协作与扩编由蜂群系统在后台完成。
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-8 rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                立即开始
              </button>
            </div>
          </section>
        )}
      </div>

      <CreateSwarmSessionModal
        isOpen={isCreateModalOpen}
        isSubmitting={isTeamLoading}
        error={teamError}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateSwarmSession}
      />

      <AgentDetailDrawer
        agent={selectedAgent}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        messages={agentMessages}
        activities={agentActivities}
      />
    </div>
  );
};
