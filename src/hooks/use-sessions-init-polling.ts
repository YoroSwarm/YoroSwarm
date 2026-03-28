'use client';

import { useEffect, useRef } from 'react';
import { useWorkspacesStore } from '@/stores';
import { workspacesApi } from '@/lib/api/workspaces';

/**
 * 全局轮询工作区的初始化状态
 * - 当有工作区在初始化时，持续轮询直到所有工作区完成
 * - 使用 setTimeout 链式轮询，而不是 setInterval
 */
export function useSessionsInitPolling(intervalMs = 3000) {
  const initializingWorkspaces = useWorkspacesStore((state) => state.initializingWorkspaces);
  const setWorkspaceInitializing = useWorkspacesStore((state) => state.setWorkspaceInitializing);
  const setWorkspaceVenvError = useWorkspacesStore((state) => state.setWorkspaceVenvError);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  useEffect(() => {
    // 如果没有正在初始化的工作区，停止轮询
    if (initializingWorkspaces.size === 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const checkAndPoll = async () => {
      // 如果已经有轮询在运行，跳过
      if (isRunningRef.current) {
        // 但仍计划下一次轮询
        return;
      }

      isRunningRef.current = true;

      try {
        for (const workspaceId of initializingWorkspaces) {
          try {
            const status = await workspacesApi.getWorkspaceStatus(workspaceId);
            if (status.venvReady && status.workspaceReady) {
              setWorkspaceInitializing(workspaceId, false);
              setWorkspaceVenvError(workspaceId, false);
            } else if (status.venvStatus === 'error') {
              setWorkspaceInitializing(workspaceId, false);
              setWorkspaceVenvError(workspaceId, true);
            } else {
              setWorkspaceInitializing(workspaceId, true);
              setWorkspaceVenvError(workspaceId, false);
            }
          } catch {
            // 忽略单个工作区的错误，继续处理下一个
          }
        }
      } finally {
        isRunningRef.current = false;
      }

      // 检查是否还有工作区在初始化
      const currentInitializing = useWorkspacesStore.getState().initializingWorkspaces;
      if (currentInitializing.size > 0) {
        // 继续轮询
        timeoutRef.current = setTimeout(checkAndPoll, intervalMs);
      }
    };

    // 立即开始第一次轮询
    checkAndPoll();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [initializingWorkspaces.size, setWorkspaceInitializing, setWorkspaceVenvError, intervalMs]);
}
