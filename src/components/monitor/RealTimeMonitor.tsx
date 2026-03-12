'use client';

import React from 'react';
import type { AgentActivity, AgentMessage } from '@/types/agent';

interface RealTimeMonitorProps {
  activities: AgentActivity[];
  messages: AgentMessage[];
  isConnected: boolean;
}

export const RealTimeMonitor: React.FC<RealTimeMonitorProps> = ({
  activities,
  messages,
  isConnected,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">实时监控</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-500">{isConnected ? '已连接' : '未连接'}</span>
        </div>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {activities.length === 0 && messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">暂无活动数据</div>
        ) : (
          <>
            {activities.slice(0, 10).map((activity, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
                  {activity.agentName.charAt(0)}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{activity.agentName}</div>
                  <div className="text-sm text-gray-500">{activity.details || activity.action}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(activity.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
