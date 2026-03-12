'use client';

import React from 'react';
import type { Task } from '@/types/agent';

interface TaskStatusPanelProps {
  tasks: Task[];
}

export const TaskStatusPanel: React.FC<TaskStatusPanelProps> = ({ tasks }) => {
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        任务状态
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">待处理</div>
        </div>
        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">进行中</div>
        </div>
        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">已完成</div>
        </div>
      </div>
    </div>
  );
};
