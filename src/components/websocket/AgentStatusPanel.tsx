'use client';

import React from 'react';
import type { Agent } from '@/types/agent';

interface AgentStatusPanelProps {
  agents: Agent[];
}

export const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({ agents }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        Agent 状态
      </h3>
      <div className="space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  agent.status === 'online'
                    ? 'bg-green-500'
                    : agent.status === 'busy'
                    ? 'bg-yellow-500'
                    : 'bg-gray-500'
                }`}
              />
              <span className="font-medium text-gray-900 dark:text-white">
                {agent.name}
              </span>
            </div>
            <span className="text-sm text-gray-500">{agent.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
