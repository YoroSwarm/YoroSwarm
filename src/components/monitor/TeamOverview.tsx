'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionSummary } from '@/types/agent';
import type { SwarmSessionMonitorResponse } from '@/lib/api/swarm-sessions';

interface SessionOverviewProps {
  session: SessionSummary;
  onSessionUpdate: (session: SessionSummary) => void;
  metrics?: SwarmSessionMonitorResponse['metrics'] | null;
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export const SessionOverview: React.FC<SessionOverviewProps> = ({
  session,
  metrics,
}) => {
  const sessionUsage = metrics?.llm_usage.session;
  const leadUsage = metrics?.llm_usage.lead;
  const teammateUsage = [...(metrics?.llm_usage.teammates || [])]
    .sort((a, b) => b.usage.total_tokens - a.usage.total_tokens)
    .slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{session.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{session.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {session.activeAgents} / {session.agentCount} 在线
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{session.agentCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总 Agent 数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{session.activeAgents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">活跃 Agent</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{session.totalTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总任务数</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{session.completedTasks}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">已完成任务</div>
        </div>
      </div>

      {sessionUsage ? (
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">LLM Token Usage</h3>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-700/60">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-300">当前会话总计</div>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatTokenCount(sessionUsage.total_tokens)}</div>
              <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <div>输入: {formatTokenCount(sessionUsage.input_tokens)}</div>
                <div>输出: {formatTokenCount(sessionUsage.output_tokens)}</div>
                <div>缓存读取: {formatTokenCount(sessionUsage.cache_read_tokens)}</div>
                <div>缓存命中率: {formatPercent(sessionUsage.cache_hit_rate)}</div>
              </div>
            </div>

            {leadUsage ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-700/60">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-300">Lead</div>
                <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatTokenCount(leadUsage.total_tokens)}</div>
                <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <div>输入: {formatTokenCount(leadUsage.input_tokens)}</div>
                  <div>输出: {formatTokenCount(leadUsage.output_tokens)}</div>
                  <div>缓存读取: {formatTokenCount(leadUsage.cache_read_tokens)}</div>
                  <div>缓存命中率: {formatPercent(leadUsage.cache_hit_rate)}</div>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-700/60">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-300">Top Teammates</div>
              <div className="mt-3 space-y-3">
                {teammateUsage.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">暂无 teammate token 数据</div>
                ) : (
                  <AnimatePresence initial={false}>
                    {teammateUsage.map((item) => (
                      <motion.div
                        key={item.agent_id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{
                          layout: { type: 'spring', stiffness: 500, damping: 35 },
                          opacity: { duration: 0.2 },
                        }}
                        className="rounded-lg bg-white/80 px-3 py-2 dark:bg-gray-800/70"
                      >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{item.agent_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{item.role}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatTokenCount(item.usage.total_tokens)}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      输入 {formatTokenCount(item.usage.input_tokens)} / 输出 {formatTokenCount(item.usage.output_tokens)} / 缓存率 {formatPercent(item.usage.cache_hit_rate)}
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
