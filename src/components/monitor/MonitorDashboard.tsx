'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { AgentList } from './AgentList';
import { CreateSwarmSessionModal } from './CreateSwarmSessionModal';
import { RealTimeMonitor } from './RealTimeMonitor';
import { TaskAssignment } from './TaskAssignment';
import { TeamOverview } from './TeamOverview';
import { useSwarmTeam } from '@/hooks/use-swarm-team';
import { useTasks } from '@/hooks/use-tasks';
import { useSessions } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import type { Agent, AgentActivity, AgentMessage, Task } from '@/types/agent';

const defaultActivities: AgentActivity[] = [
  {
    id: 'activity-1',
    agentId: 'team-lead',
    agentName: 'Team Lead',
    action: 'team_bootstrap',
    details: 'Lead 已接管会话，正在评估目标并准备创建工作项。',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'activity-2',
    agentId: 'researcher',
    agentName: 'Researcher',
    action: 'standby',
    details: 'Researcher 待命，可开始信息搜集与资料比对。',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'activity-3',
    agentId: 'documenter',
    agentName: 'Documenter',
    action: 'standby',
    details: 'Documenter 待命，可生成文档、PPT 结构和表格方案。',
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
  const router = useRouter();
  const {
    teams,
    currentTeam,
    currentTeamId,
    currentTeamCard,
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
  } = useTasks({ teamId: currentTeamId || undefined, autoLoad: Boolean(currentTeamId) });
  const { openDirectSessionForAgent } = useSessions({ autoLoad: false });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [openingDirectChatAgentId, setOpeningDirectChatAgentId] = useState<string | null>(null);
  const [directChatError, setDirectChatError] = useState<string | null>(null);

  const messages = defaultMessages;

  const activities = useMemo(() => {
    if (!currentTeam) return defaultActivities;

    return [
      {
        id: `${currentTeam.id}-lead`,
        agentId: currentTeam.agents?.[0]?.id || 'team-lead',
        agentName: currentTeam.agents?.[0]?.name || 'Team Lead',
        action: 'lead_active',
        details: 'Lead 正在维护团队状态、评估进度并准备分配下一轮任务。',
        timestamp: new Date().toISOString(),
      },
      ...defaultActivities.slice(1),
    ];
  }, [currentTeam]);

  const { isConnected } = useWebSocket({
    url: 'ws://localhost:3001',
    onMessage: (msg) => {
      console.log('WebSocket message:', msg);
    },
  });

  const isLoading = isTeamLoading || isTasksLoading;
  const error = directChatError || teamError || tasksError;

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
    setDirectChatError(null);
  };

  const handleCreateSwarmSession = async (sessionData: {
    name: string;
    description: string;
    sessionGoal: string;
  }) => {
    await createSwarmSession(sessionData);
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

  const handleOpenDirectChat = async (agent: Agent) => {
    setOpeningDirectChatAgentId(agent.id);
    setDirectChatError(null);

    try {
      const session = await openDirectSessionForAgent(agent.id, agent.name);
      setIsDrawerOpen(false);
      router.push(`/chat?sessionId=${encodeURIComponent(session.id)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '打开队友会话失败';
      setDirectChatError(message);
      console.error('打开队友会话失败:', err);
    } finally {
      setOpeningDirectChatAgentId(null);
    }
  };

  const agentMessages = selectedAgent
    ? messages.filter((message) => message.agentId === selectedAgent.id)
    : [];
  const agentActivities = selectedAgent
    ? activities.filter((activity) => activity.agentId === selectedAgent.id)
    : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(244,244,245,0.95)_30%,_rgba(228,228,231,1)_100%)] px-4 py-6 text-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[32px] border border-white/40 bg-white/65 shadow-[0_24px_80px_rgba(15,15,15,0.08)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.26em] text-neutral-500">
                Swarm Control Surface
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 lg:text-4xl">Team Lead 驱动的 Agent 集群</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 lg:text-base">
                  面向单用户的通用办公 Agent 系统。创建会话后，Lead 会自动拉起队友并负责拆解任务、并行推进、动态发现改进方向。
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
                创建 Swarm 会话
              </button>
            </div>
          </div>

          <div className="border-t border-black/10 bg-white/40 px-6 py-4 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">Active Sessions</span>
              {teams.length === 0 ? (
                <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-sm text-neutral-500">尚未创建会话</span>
              ) : (
                teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setCurrentTeamId(team.id)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      currentTeamId === team.id
                        ? 'bg-neutral-950 text-white'
                        : 'border border-black/10 bg-white/75 text-neutral-700 hover:bg-white'
                    }`}
                  >
                    {team.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </header>

        {currentTeamCard ? (
          <>
            <TeamOverview team={currentTeamCard} onTeamUpdate={() => {}} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/40 bg-white/65 p-6 shadow-[0_18px_60px_rgba(15,15,15,0.06)] backdrop-blur-2xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-neutral-950">Teammates</h2>
                      <p className="mt-1 text-sm text-neutral-500">Lead 自动编队，用户可随时点开任意队友并进入直接对话。</p>
                    </div>
                    <div className="rounded-full bg-black/5 px-3 py-1 text-xs text-neutral-600">{agents.length} agents</div>
                  </div>
                  <AgentList
                    agents={agents}
                    onAgentClick={handleAgentClick}
                    selectedAgentId={selectedAgent?.id}
                  />
                </section>

                <section className="rounded-[28px] border border-white/40 bg-neutral-950 p-6 text-white shadow-[0_18px_60px_rgba(15,15,15,0.12)]">
                  <h2 className="text-lg font-semibold">系统设计对齐</h2>
                  <div className="mt-4 space-y-3 text-sm text-white/72">
                    <div>Lead 负责创建团队、协调任务和动态增减队员。</div>
                    <div>Teammates 保持独立上下文，适合并行搜集、撰写、分析和编码。</div>
                    <div>当前已支持从监控页直连任意 teammate；后续可以继续补 agent-native 身份和多依赖任务解锁。</div>
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
                  agents={agents}
                  tasks={tasks}
                  onAssignTask={handleAssignTask}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                />
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-[32px] border border-white/40 bg-white/65 px-8 py-14 text-center shadow-[0_18px_60px_rgba(15,15,15,0.06)] backdrop-blur-2xl">
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">No Session Yet</p>
              <h2 className="mt-3 text-3xl font-semibold text-neutral-950">先创建一个 Swarm 会话</h2>
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                当前仓库已经有 Team、Agent、任务与监控基础结构。创建会话后，系统会自动生成 Team Lead 和默认 teammates，替代手动逐个创建 agent。
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-8 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
              >
                立即创建
              </button>
            </div>
          </section>
        )}
      </div>

      <CreateSwarmSessionModal
        isOpen={isCreateModalOpen}
        isSubmitting={isTeamLoading}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateSwarmSession}
      />

      <AgentDetailDrawer
        agent={selectedAgent}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        messages={agentMessages}
        activities={agentActivities}
        onOpenDirectChat={handleOpenDirectChat}
        isOpeningDirectChat={selectedAgent?.id === openingDirectChatAgentId}
      />
    </div>
  );
};
