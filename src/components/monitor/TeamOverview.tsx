'use client';

import React from 'react';
import type { SessionSummary } from '@/types/agent';

interface SessionOverviewProps {
  session: SessionSummary;
  onSessionUpdate: (session: SessionSummary) => void;
}

export const SessionOverview: React.FC<SessionOverviewProps> = ({
  session,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{session.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{session.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {session.activeAgents} / {session.agentCount} 在线
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{session.agentCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总 Agent 数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{session.activeAgents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">活跃 Agent</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{session.totalTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总任务数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{session.completedTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">已完成任务</div>
        </div>
      </div>
    </div>
  );
};
