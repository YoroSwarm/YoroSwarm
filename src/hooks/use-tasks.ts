'use client';

import { useState, useCallback, useEffect } from 'react';
import { tasksApi, type TaskStatus, type TaskPriority } from '@/lib/api/tasks';
import { swarmSessionsApi } from '@/lib/api/swarm-sessions';
import { storage } from '@/utils/storage';
import type { Task } from '@/types/agent';

const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

interface UseTasksOptions {
  swarmSessionId?: string;
  autoLoad?: boolean;
  pollInterval?: number;
}

type SessionTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_agent_id?: string;
  dependency_ids?: string[];
  is_locked?: boolean;
  created_at: string;
  updated_at: string;
};

const convertTask = (task: SessionTask): Task => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: (task.status as Task['status']) || 'pending',
  assignedTo: task.assigned_agent_id,
  dependencyIds: task.dependency_ids,
  isLocked: task.is_locked,
  priority: (task.priority as Task['priority']) || 'medium',
  createdAt: task.created_at,
  updatedAt: task.updated_at,
});

export function useTasks(options: UseTasksOptions = {}) {
  const { swarmSessionId, autoLoad = true, pollInterval = 0 } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const resolvedSessionId = swarmSessionId || storage.get<string>(CURRENT_SESSION_STORAGE_KEY) || undefined;

  const loadTasks = useCallback(async (params?: { status?: TaskStatus }) => {
    if (!resolvedSessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await swarmSessionsApi.getSessionTasks(resolvedSessionId);
      const filtered = params?.status ? response.items.filter((task) => task.status === params.status) : response.items;
      const convertedTasks = filtered.map((task) => convertTask(task as SessionTask));
      setTasks(convertedTasks);
      setTotalCount(convertedTasks.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId]);

  const createTask = useCallback(async (data: { title: string; description: string; priority?: TaskPriority; }) => {
    if (!resolvedSessionId) {
      throw new Error('No active swarm session');
    }

    setIsLoading(true);
    try {
      const response = await swarmSessionsApi.createSessionTask(resolvedSessionId, {
        title: data.title,
        description: data.description,
        priority: data.priority,
      });
      const newTask = convertTask(response as SessionTask);
      setTasks((prev) => [newTask, ...prev]);
      return newTask;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId]);

  const assignTask = useCallback(async (taskId: string, agentId?: string) => {
    await tasksApi.assignTask(taskId, {
      agent_id: agentId,
      strategy: agentId ? undefined : 'auto',
    });
    await loadTasks();
  }, [loadTasks]);

  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    await tasksApi.updateTaskStatus(taskId, { status });
    setTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task));
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await tasksApi.deleteTask(taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

  useEffect(() => {
    if (autoLoad && resolvedSessionId) {
      void loadTasks();
    }
  }, [autoLoad, loadTasks, resolvedSessionId]);

  useEffect(() => {
    if (!autoLoad || !resolvedSessionId || pollInterval <= 0) return;
    const timer = setInterval(() => { void loadTasks(); }, pollInterval);
    return () => clearInterval(timer);
  }, [autoLoad, resolvedSessionId, pollInterval, loadTasks]);

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
