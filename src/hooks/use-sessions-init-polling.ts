'use client';

import { useEffect, useRef } from 'react';
import { useSessionsStore } from '@/stores';

/**
 * 全局轮询所有会话的初始化状态
 * - 优先 WS 推送（目前 WS 未携带 venv 状态）
 * - 轮询作为辅助，在页面刷新或 WS 断开时保证状态同步
 * - 对所有会话进行轮询，不限于当前会话
 */
export function useSessionsInitPolling(intervalMs = 5000) {
  const refreshAllSessionsInitStatus = useSessionsStore(
    (state) => state.refreshAllSessionsInitStatus
  );
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 立即执行一次
    refreshAllSessionsInitStatus();

    // 设置轮询
    intervalRef.current = setInterval(() => {
      refreshAllSessionsInitStatus();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshAllSessionsInitStatus, intervalMs]);
}
