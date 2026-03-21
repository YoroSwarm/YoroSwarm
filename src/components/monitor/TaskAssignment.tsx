'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Agent, Task } from '@/types/agent';

interface TaskAssignmentProps {
  agents: Agent[];
  tasks: Task[];
  onAssignTask: (taskId: string, agentId: string | undefined) => void;
  onUpdateTaskStatus: (taskId: string, status: Task['status']) => void;
}

export const TaskAssignment: React.FC<TaskAssignmentProps> = ({
  agents,
  tasks,
  onAssignTask,
  onUpdateTaskStatus,
}) => {
  const executableAgents = agents.filter((agent) => agent.type !== 'leader');

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: Task['status']) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'in_progress': return '进行中';
      case 'completed': return '已完成';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">任务分配</h2>

      <div className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <div className="text-center text-gray-500 py-8">暂无任务</div>
        ) : (
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -30 }}
                transition={{
                  layout: { type: 'spring', stiffness: 500, damping: 35 },
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 },
                }}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">{task.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{task.description}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                    {getStatusLabel(task.status)}
                  </span>
                  <span className="text-xs text-gray-400">优先级: {task.priority}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={task.assignedTo || ''}
                  onChange={(e) => onAssignTask(task.id, e.target.value || undefined)}
                  disabled={executableAgents.length === 0}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="">{executableAgents.length === 0 ? '等待 Lead 创建 teammate' : '未分配'}</option>
                  {executableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <select
                  value={task.status}
                  onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as Task['status'])}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="pending">待处理</option>
                  <option value="in_progress">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        )}
      </div>

      {tasks.length > 0 && executableAgents.length === 0 ? (
        <div className="mt-4 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          当前没有可执行任务的 teammate。按照原始架构，应由 Lead 先动态创建合适队员，再进行分配。
        </div>
      ) : null}
    </div>
  );
};
