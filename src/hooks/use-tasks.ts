/**
 * Tasks Hook
 * 迁移自 React SPA: frontend/src/hooks/useTasks.ts
 * 用于管理任务数据
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { tasksApi, type TaskResponse, type TaskStatus, type TaskPriority } from '@/lib/api/tasks';
import type { Task } from '@/types/agent';

interface UseTasksOptions {
  teamId?: string;
  autoLoad?: boolean;
}

// 转换 API 任务到前端 Task 类型
const convertApiTask = (apiTask: TaskResponse): Task => {
  const statusMap: Record<string, Task['status']> = {
    pending: 'pending',
    in_progress: 'in_progress',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
  };

  const priorityMap: Record<string, Task['priority']> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
  };

  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description,
    status: statusMap[apiTask.status] || 'pending',
    assignedTo: apiTask.assigned_agent_id,
    priority: priorityMap[apiTask.priority] || 'medium',
    createdAt: apiTask.created_at,
    updatedAt: apiTask.updated_at,
  };
};

export function useTasks(options: UseTasksOptions = {}) {
  const { teamId, autoLoad = true } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // 加载任务列表
  const loadTasks = useCallback(async (params?: { status?: TaskStatus }) => {
    setIsLoading(true);
    setError(null);
    try {
      let response;
      if (teamId) {
        response = await tasksApi.getTeamTasks(teamId, params);
      } else {
        response = await tasksApi.listTasks(params);
      }
      const convertedTasks = response.items.map(convertApiTask);
      setTasks(convertedTasks);
      setTotalCount(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  // 创建任务
  const createTask = useCallback(async (data: {
    title: string;
    description: string;
    priority?: TaskPriority;
  }) => {
    setIsLoading(true);
    try {
      const response = await tasksApi.createTask({
        title: data.title,
        description: data.description,
        priority: data.priority,
      });
      const newTask = convertApiTask(response);
      setTasks((prev) => [newTask, ...prev]);
      return newTask;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 分配任务
  const assignTask = useCallback(async (taskId: string, agentId?: string) => {
    try {
      await tasksApi.assignTask(taskId, {
        agent_id: agentId,
        strategy: agentId ? undefined : 'auto',
      });
      // 重新加载任务列表
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '分配任务失败');
      throw err;
    }
  }, [loadTasks]);

  // 更新任务状态
  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    try {
      await tasksApi.updateTaskStatus(taskId, { status });
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务状态失败');
      throw err;
    }
  }, []);

  // 删除任务
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      await tasksApi.deleteTask(taskId);
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败');
      throw err;
    }
  }, []);

  // 自动加载
  useEffect(() => {
    if (autoLoad) {
      loadTasks();
    }
  }, [autoLoad, loadTasks]);

  return {
    tasks,
    isLoading,
    error,
    totalCount,
    loadTasks,
    createTask,
    assignTask,
    updateTaskStatus,
    deleteTask,
  };
}
