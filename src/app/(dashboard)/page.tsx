"use client";

import { useAgents } from "@/hooks/use-agents";
import { useTasks } from "@/hooks/use-tasks";
import { useTeamStats } from "@/hooks/use-team-stats";
import {
  Users,
  CheckCircle2,
  Clock,
  Zap,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils/date";

export default function DashboardPage() {
  const { agents, isLoading: isAgentsLoading } = useAgents({ autoLoad: true });
  const { tasks, isLoading: isTasksLoading } = useTasks({ autoLoad: true });
  const {
    totalAgents,
    totalTasks,
    completedTasks,
    isLoading: isStatsLoading,
  } = useTeamStats();

  const isLoading = isAgentsLoading || isTasksLoading || isStatsLoading;

  // 计算统计数据
  const busyAgents = agents.filter((a) => a.status === "busy").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;

  // Real Recent Activity from Tasks
  const recentActivities = tasks
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      type: 'task',
      message: `任务 "${task.title}" ${task.status === 'completed' ? '已完成' : task.status === 'in_progress' ? '进行中' : '已创建'}`,
      time: formatTimeAgo(task.updatedAt || task.createdAt),
      icon: task.status === 'completed' ? CheckCircle2 : task.status === 'in_progress' ? Clock : Zap
    }));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            欢迎来到 Swarm Agent集群系统
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载中...
          </div>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="总Agent数"
          value={totalAgents}
          icon={Users}
          trend={`${busyAgents} 忙碌`}
          trendUp={busyAgents > 0}
          href="/chat"
        />
        <StatCard
          title="进行中任务"
          value={inProgressTasks}
          icon={Clock}
          trend={`${pendingTasks} 待处理`}
          trendUp={inProgressTasks > 0}
          href="/tasks"
        />
        <StatCard
          title="已完成任务"
          value={completedTasks}
          icon={CheckCircle2}
          trend={`${totalTasks} 总计`}
          trendUp={true}
          href="/tasks"
        />
      </div>

      {/* 主要内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent 状态 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card-hand p-6">
            <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
              <h2 className="text-lg font-semibold">Agent 状态</h2>
            </div>
            <div className="space-y-3">
              {agents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        agent.status === "online"
                          ? "bg-green-500"
                          : agent.status === "busy"
                          ? "bg-amber-500"
                          : agent.status === "offline"
                          ? "bg-gray-500"
                          : "bg-blue-500"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                         <p className="font-semibold">{agent.name}</p>
                         <span className="text-[10px] px-1.5 py-0.5 bg-muted border border-border rounded-full font-mono">
                           {agent.type === 'leader' ? 'LEAD' : 'WORKER'}
                         </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agent.description?.slice(0, 30) || "无描述"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {agent.status === "online"
                        ? "在线"
                        : agent.status === "busy"
                        ? "忙碌"
                        : agent.status === "offline"
                        ? "离线"
                        : "空闲"}
                    </p>
                    {/* Placeholder for Session info if available */}
                    <p className="text-xs text-muted-foreground truncate max-w-37.5">
                       {agent.currentTask || '空闲中'}
                    </p>
                  </div>
                </div>
              ))}
              {agents.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无队友</p>
                  <Link
                    href="/chat"
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                  >
                    打开会话
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 任务概览 */}
          <div className="card-hand p-6">
            <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
              <h2 className="text-lg font-semibold">最近任务</h2>
              <Link
                href="/tasks"
                className="text-sm text-primary hover:underline font-bold"
              >
                查看全部
              </Link>
            </div>
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.description?.slice(0, 50) || "无描述"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold border-2 ${
                        task.status === "completed"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : task.status === "in_progress"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : task.status === "pending"
                          ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                          : "bg-gray-100 text-gray-800 border-gray-200"
                      }`}
                    >
                      {task.status === "completed"
                        ? "已完成"
                        : task.status === "in_progress"
                        ? "进行中"
                        : task.status === "pending"
                        ? "待处理"
                        : task.status}
                    </span>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无任务</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 侧边栏 */}
        <div className="space-y-6">
          {/* 快速操作 */}
          <div className="card-hand p-6">
            <h2 className="text-lg font-semibold mb-4 border-b border-border/50 pb-2">快速操作</h2>
            <div className="space-y-2">
              <QuickActionButton
                href="/chat"
                icon={MessageSquare}
                label="开始对话"
                description="新建或继续会话"
              />
              <QuickActionButton
                href="/profile"
                icon={Users}
                label="个人资料"
                description="查看个人信息"
              />
              <QuickActionButton
                href="/settings"
                icon={Settings}
                label="偏好设置"
                description="调整系统设置"
              />
            </div>
          </div>

          {/* 最近活动 */}
          <div className="card-hand p-6">
            <h2 className="text-lg font-semibold mb-4 border-b border-border/50 pb-2">最近活动</h2>
            <div className="space-y-4">
              {recentActivities.length > 0 ? recentActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3 items-center">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-border/50">
                    <activity.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{activity.message}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-4 text-muted-foreground text-sm">暂无活动</div>
              )}
            </div>
          </div>

          {/* 系统状态 */}
          <div className="card-hand p-6">
            <h2 className="text-lg font-semibold mb-4 border-b border-border/50 pb-2">系统状态</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API 连接</span>
                <span className="flex items-center gap-1 text-sm text-green-600 font-bold">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  正常
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">WebSocket</span>
                <span className="flex items-center gap-1 text-sm text-green-600 font-bold">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  已连接
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">系统负载</span>
                <span className="text-sm font-bold">
                  {/* Mock Real Load based on busy agents */}
                  {Math.round((busyAgents / (totalAgents || 1)) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  trend: string;
  trendUp: boolean;
  href: string;
}) {
  return (
    <Link href={href} className="block group">
      <div className="card-hand p-6 transition-all hover:shadow-lg hover:-translate-y-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-semibold mt-2">{value}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-border/50">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <TrendingUp
            className={`h-4 w-4 ${trendUp ? "text-green-600" : "text-gray-400"}`}
          />
          <span className="text-sm text-muted-foreground">{trend}</span>
        </div>
      </div>
    </Link>
  );
}

// 快速操作按钮组件
function QuickActionButton({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
