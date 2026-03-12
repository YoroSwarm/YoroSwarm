'use client';

import React, { useState } from 'react';
import type { Agent, AgentActivity, AgentMessage } from '@/types/agent';

interface AgentDetailDrawerProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  messages: AgentMessage[];
  activities: AgentActivity[];
  onSendMessage: (content: string) => void;
}

export const AgentDetailDrawer: React.FC<AgentDetailDrawerProps> = ({
  agent,
  isOpen,
  onClose,
  messages,
  activities,
  onSendMessage,
}) => {
  const [messageContent, setMessageContent] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'messages' | 'activities'>('overview');

  if (!isOpen || !agent) return null;

  const handleSendMessage = () => {
    if (messageContent.trim()) {
      onSendMessage(messageContent);
      setMessageContent('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 h-full shadow-xl overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                {agent.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{agent.name}</h2>
                <p className="text-sm text-gray-500">{agent.type}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['overview', 'messages', 'activities'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' ? '概览' : tab === 'messages' ? '消息' : '活动'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">描述</h3>
                <p className="text-gray-600 dark:text-gray-400">{agent.description || '暂无描述'}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">专长</h3>
                <div className="flex flex-wrap gap-2">
                  {agent.expertise?.map((skill) => (
                    <span key={skill} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {skill}
                    </span>
                  )) || <span className="text-gray-500">暂无专长</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{agent.messageCount}</div>
                  <div className="text-sm text-gray-500">消息数</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{agent.completedTasks}</div>
                  <div className="text-sm text-gray-500">完成任务</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="space-y-4">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">暂无消息</div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">{msg.content}</div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="输入消息..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  发送
                </button>
              </div>
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-center text-gray-500 py-8">暂无活动</div>
              ) : (
                activities.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                    <div>
                      <div className="text-sm text-gray-900 dark:text-white">{activity.details || activity.action}</div>
                      <div className="text-xs text-gray-400">{new Date(activity.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
