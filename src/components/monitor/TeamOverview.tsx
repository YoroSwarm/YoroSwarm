'use client';

import React from 'react';
import type { Team } from '@/types/agent';

interface TeamOverviewProps {
  team: Team;
  onTeamUpdate: (team: Team) => void;
}

export const TeamOverview: React.FC<TeamOverviewProps> = ({
  team,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{team.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{team.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {team.activeAgents} / {team.agentCount} 在线
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{team.agentCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总Agent数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{team.activeAgents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">活跃Agent</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{team.totalTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总任务数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{team.completedTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">已完成任务</div>
        </div>
      </div>
    </div>
  );
};
