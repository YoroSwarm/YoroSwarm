'use client';

import React, { useState } from 'react';
import { AgentList } from './AgentList';
import { TeamOverview } from './TeamOverview';
import { RealTimeMonitor } from './RealTimeMonitor';
import { CreateAgentModal } from './CreateAgentModal';
import { TaskAssignment } from './TaskAssignment';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { useAgents } from '@/hooks/use-agents';
import { useTasks } from '@/hooks/use-tasks';
import { useTeamStats } from '@/hooks/use-team-stats';
import { useWebSocket } from '@/hooks/use-websocket';
import type { Agent, Team, Task } from '@/types/agent';

export const MonitorDashboard: React.FC = () => {
  const {
    agents,
    activities,
    messages,
    selectedAgent,
    setSelectedAgent,
    createAgent,
    addMessage,
    getAgentMessages,
    getAgentActivities,
    isLoading: isAgentsLoading,
    error: agentsError,
  } = useAgents();

  const {
    tasks,
    isLoading: isTasksLoading,
    error: tasksError,
    assignTask,
    updateTaskStatus,
  } = useTasks({ autoLoad: true });

  const {
    totalAgents,
    activeAgents,
    totalTasks,
    completedTasks,
    isLoading: isStatsLoading,
    error: statsError,
  } = useTeamStats({ teamId: 'default' });

  const team: Team = {
    id: 'default',
    name: 'Swarm Development Team',
    description: '专注于AI多智能体协作系统的开发团队',
    agentCount: totalAgents,
    activeAgents: activeAgents,
    totalTasks: totalTasks,
    completedTasks: completedTasks,
  };

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { isConnected } = useWebSocket({
    url: 'ws://localhost:8000/ws',
    onMessage: (msg) => {
      console.log('WebSocket message:', msg);
    },
  });

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
  };

  const handleCreateAgent = async (agentData: {
    name: string;
    type: Agent['type'];
    description: string;
    expertise: string[];
  }) => {
    try {
      await createAgent({
        ...agentData,
        status: 'idle',
        load: 0,
      });
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('创建Agent失败:', err);
    }
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

  const handleSendMessage = (content: string) => {
    if (selectedAgent) {
      addMessage({
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        content,
        type: 'message',
      });
    }
  };

  const agentMessages = selectedAgent ? getAgentMessages(selectedAgent.id) : [];
  const agentActivities = selectedAgent ? getAgentActivities(selectedAgent.id) : [];

  const isLoading = isAgentsLoading || isTasksLoading || isStatsLoading;
  const error = agentsError || tasksError || statsError;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">Swarm Monitor</span>
            </div>
            <div className="flex items-center gap-4">
              {isLoading && (
                <div className="text-sm text-gray-500">
                  <svg className="animate-spin inline-block h-4 w-4 mr-1" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  加载中...
                </div>
              )}
              {error && (
                <div className="text-sm text-red-500">
                  错误: {error}
                </div>
              )}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                创建Agent
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <TeamOverview team={team} onTeamUpdate={() => {}} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Agent列表</h2>
                <AgentList
                  agents={agents}
                  onAgentClick={handleAgentClick}
                  selectedAgentId={selectedAgent?.id}
                />
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
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
        </div>
      </main>

      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateAgent}
      />

      <AgentDetailDrawer
        agent={selectedAgent}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        messages={agentMessages}
        activities={agentActivities}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};
