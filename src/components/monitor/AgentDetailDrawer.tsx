'use client';

import React, { useMemo } from 'react';
import type { Agent, AgentActivity, AgentMessage } from '@/types/agent';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AgentDetailDrawerProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  messages: AgentMessage[];
  activities: AgentActivity[];
}

export const AgentDetailDrawer: React.FC<AgentDetailDrawerProps> = ({
  agent,
  isOpen,
  onClose,
  messages,
  activities,
}) => {
  const expertise = useMemo(() => agent?.expertise || [], [agent?.expertise]);

  if (!agent) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full max-w-xl sm:max-w-xl border-l border-white/20 bg-white/80 shadow-[0_24px_80px_rgba(15,15,15,0.18)] backdrop-blur-2xl p-0 gap-0"
      >
        <SheetHeader className="border-b border-black/10 px-6 py-6 space-y-0 gap-0">
          <div className="flex items-center gap-4 pr-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-lg font-semibold text-white shadow-lg">
              {agent.name.charAt(0)}
            </div>
            <div>
              <SheetTitle className="text-2xl font-semibold tracking-tight text-neutral-950">
                {agent.name}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-neutral-500">
                {agent.type}
              </SheetDescription>
              <Badge
                variant="outline"
                className="mt-3 h-auto rounded-full border-black/10 bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-neutral-500"
              >
                {agent.status}
              </Badge>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-black/10 bg-white/70 px-4 py-2.5 text-sm text-neutral-500">
            该抽屉仅用于监控当前 agent 在该 SwarmSession 内的状态、活动与摘要。用户外部沟通统一通过该会话的 Lead 完成。
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-1 flex-col gap-0 min-h-0">
          <TabsList
            variant="line"
            className="w-full shrink-0 rounded-none border-b border-black/10 bg-transparent h-auto p-0"
          >
            <TabsTrigger value="overview" className="flex-1 rounded-none py-3 text-sm font-medium">
              概览
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex-1 rounded-none py-3 text-sm font-medium">
              消息
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex-1 rounded-none py-3 text-sm font-medium">
              活动
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="overview" className="mt-0 space-y-6 p-6">
              <section className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                <h3 className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500">Profile</h3>
                <p className="mt-4 text-sm leading-7 text-neutral-700">{agent.description || '暂无描述'}</p>
              </section>

              <section className="grid grid-cols-2 gap-4">
                <div className="rounded-[24px] border border-black/10 bg-neutral-950 p-5 text-white">
                  <div className="text-3xl font-semibold">{agent.messageCount}</div>
                  <div className="mt-2 text-sm text-white/70">消息数</div>
                </div>
                <div className="rounded-[24px] border border-black/10 bg-white/75 p-5">
                  <div className="text-3xl font-semibold text-neutral-950">{agent.completedTasks}</div>
                  <div className="mt-2 text-sm text-neutral-500">完成任务</div>
                </div>
              </section>

              <section className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500">Workload</h3>
                  <span className="text-sm text-neutral-700">{agent.load}%</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-black/8">
                  <div className="h-2 rounded-full bg-neutral-950 transition-all" style={{ width: `${agent.load}%` }} />
                </div>
                <p className="mt-4 text-sm text-neutral-600">
                  {agent.currentTask ? `当前任务：${agent.currentTask}` : '当前没有活跃任务，Lead 可随时派发新工作项。'}
                </p>
              </section>

              <section className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                <h3 className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500">Expertise</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {expertise.length > 0 ? expertise.map((skill) => (
                    <Badge
                      key={skill}
                      variant="outline"
                      className="h-auto rounded-full border-black/10 bg-black/5 px-3 py-1.5 text-xs text-neutral-700"
                    >
                      {skill}
                    </Badge>
                  )) : <span className="text-sm text-neutral-500">暂无专长标签</span>}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="messages" className="mt-0 p-6">
              <section className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500">Recent Signals</h3>
                    <p className="mt-2 text-sm text-neutral-600">这里展示监控面板内观察到的最近动态，不承载用户外部聊天。</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-neutral-500">
                      暂无监控消息。
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className="rounded-2xl border border-black/8 bg-black/[0.02] p-4">
                        <div className="text-sm leading-6 text-neutral-800">{message.content}</div>
                        <div className="mt-2 text-xs text-neutral-400">{new Date(message.timestamp).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="activities" className="mt-0 p-6">
              <section className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.24em] text-neutral-500">Activity Trail</h3>
                <div className="space-y-3">
                  {activities.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-neutral-500">
                      暂无活动记录
                    </div>
                  ) : (
                    activities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3 rounded-2xl border border-black/8 bg-black/[0.02] p-4">
                        <div className="mt-2 h-2 w-2 rounded-full bg-neutral-950" />
                        <div>
                          <div className="text-sm leading-6 text-neutral-800">{activity.details || activity.action}</div>
                          <div className="mt-2 text-xs text-neutral-400">{new Date(activity.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
