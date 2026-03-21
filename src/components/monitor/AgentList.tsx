'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Agent } from '@/types/agent';
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
  selectedAgentId?: string;
}

const statusConfig = {
  online: { color: 'bg-green-500', label: '在线', animate: '' },
  offline: { color: 'bg-gray-500', label: '离线', animate: '' },
  busy: { color: 'bg-yellow-500', label: '忙碌', animate: 'animate-pulse' },
  idle: { color: 'bg-blue-500', label: '空闲', animate: '' },
  error: { color: 'bg-red-500', label: '错误', animate: 'animate-pulse' },
};

const typeConfig = {
  leader: { label: '领导者', color: 'text-purple-600 bg-purple-100' },
  worker: { label: '工作者', color: 'text-blue-600 bg-blue-100' },
  specialist: { label: '专家', color: 'text-orange-600 bg-orange-100' },
  coordinator: { label: '协调者', color: 'text-teal-600 bg-teal-100' },
};

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  onAgentClick,
  selectedAgentId,
}) => {
  const getLoadColor = (load: number) => {
    if (load < 30) return 'bg-green-500';
    if (load < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {agents.map((agent) => {
        const status = statusConfig[agent.status];
        const type = typeConfig[agent.type];
        const isSelected = selectedAgentId === agent.id;

        return (
          <motion.div
            key={agent.id}
            layout
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: -30 }}
            transition={{
              layout: { type: 'spring', stiffness: 500, damping: 35 },
              opacity: { duration: 0.2 },
              scale: { duration: 0.2 },
            }}
            onClick={() => onAgentClick(agent)}
            className={`
              relative p-4 rounded-lg border-2 cursor-pointer
              transition-colors duration-200 ease-in-out
              hover:shadow-md
              dark:bg-gray-800 dark:border-gray-700
              ${isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 bg-white dark:bg-gray-800'
              }
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                    {agent.name.charAt(0)}
                  </div>
                  <div
                    className={`
                      absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white
                      ${status.color} ${status.animate}
                    `}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {agent.name}
                  </h3>
                  <span className={`
                    inline-block px-2 py-0.5 rounded-full text-xs font-medium
                    ${type.color} dark:bg-opacity-20
                  `}>
                    {type.label}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className={`
                  inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                  ${status.color.replace('bg-', 'text-').replace('500', '700')} ${status.color.replace('bg-', 'bg-').replace('500', '100')}
                `}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.color}`} />
                  {status.label}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {agent.currentTask && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="truncate">{agent.currentTask}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8">负载</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getLoadColor(agent.load)} transition-all duration-500`}
                    style={{ width: `${agent.load}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-10 text-right">
                  {Math.round(agent.load)}%
                </span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>消息: {agent.messageCount}</span>
              <span>已完成: {agent.completedTasks}</span>
            </div>
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
};
