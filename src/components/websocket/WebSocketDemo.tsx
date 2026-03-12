'use client';

import React, { useState } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';

export const WebSocketDemo: React.FC = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const { isConnected, sendMessage } = useWebSocket({
    url: 'ws://localhost:8000/ws',
    onMessage: (msg) => {
      setMessages((prev) => [...prev, JSON.stringify(msg)]);
    },
  });

  const handleSendTestMessage = () => {
    sendMessage({
      type: 'message',
      payload: { content: 'Hello from WebSocket Demo' },
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        WebSocket 演示
      </h3>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isConnected ? '已连接' : '未连接'}
          </span>
        </div>
        <button
          onClick={handleSendTestMessage}
          disabled={!isConnected}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          发送测试消息
        </button>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {messages.map((msg, index) => (
            <div
              key={index}
              className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
            >
              {msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
