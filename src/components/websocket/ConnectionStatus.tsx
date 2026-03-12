'use client';

import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  className,
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {isConnected ? '已连接' : '未连接'}
      </span>
    </div>
  );
};
