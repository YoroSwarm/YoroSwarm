"use client";

import { useAgents } from "@/hooks/use-agents";
import { useTasks } from "@/hooks/use-tasks";
import { useTeamStats } from "@/hooks/use-team-stats";
import {
  Users,
  Activity,
  CheckCircle2,
  Clock,
  Zap,
  MessageSquare,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { agents, isLoading: isAgentsLoading } = useAgents({ autoLoad: true });
  const { tasks, isLoading: isTasksLoading } = useTasks({ autoLoad: true });
  const {
    totalAgents,
    activeAgents,
    totalTasks,
    completedTasks,
    isLoading: isStatsLoading,
  } = useTeamStats();

  const isLoading = isAgentsLoading || isTasksLoading || isStatsLoading;

  // 计算统计数据
  const onlineAgents = agents.filter((a) => a.status !== "offline" && a.status !== "error").length;
  const busyAgents = agents.filter((a) => a.status === "busy").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;

  // 最近活动
  const recentActivities = [
    { id: 1, type: "agent", message: "Agent Worker-1 完成了任务 #1234", time: "2分钟前", icon: CheckCircle2 },
    { id: 2, type: "task", message: '新任务 "数据分析" 已创建', time: "5分钟前", icon: Zap },
    { id: 3, type: "message", message: "Leader 发送了团队消息", time: "10分钟前", icon: MessageSquare },
    { id: 4, type: "agent", message: "Agent Specialist-2 上线", time: "15分钟前", icon: Activity },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总Agent数"
          value={totalAgents}
          icon={Users}
          trend={`${onlineAgents} 在线`}
          trendUp={true}
          href="/agents"
        />
        <StatCard
          title="在线Agent"
          value={activeAgents}
          icon={Activity}
          trend={`${busyAgents} 忙碌`}
          trendUp={activeAgents > 0}
          href="/agents"
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
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Agent 状态</h2>
              <Link
                href="/agents"
                className="text-sm text-primary hover:underline"
              >
                查看全部
              </Link>
            </div>
            <div className="space-y-3">
              {agents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        agent.status === "online"
                          ? "bg-green-500"
                          : agent.status === "busy"
                          ? "bg-yellow-500"
                          : agent.status === "offline"
                          ? "bg-gray-500"
                          : "bg-blue-500"
                      }`}
                    />
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.type} · {agent.description?.slice(0, 30) || "无描述"}
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
                    {agent.currentTask && (
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {agent.currentTask}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {agents.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无 Agent</p>
                  <Link
                    href="/agents"
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                  >
                    创建第一个 Agent
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 任务概览 */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">最近任务</h2>
              <Link
                href="/tasks"
                className="text-sm text-primary hover:underline"
              >
                查看全部
              </Link>
            </div>
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.description?.slice(0, 50) || "无描述"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        task.status === "completed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : task.status === "in_progress"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : task.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
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
                    {task.assignedTo && (
                      <span className="text-xs text-muted-foreground">
                        已分配
                      </span>
                    )}
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
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">快速操作</h2>
            <div className="space-y-2">
              <QuickActionButton
                href="/chat"
                icon={MessageSquare}
                label="开始对话"
                description="与Agent进行实时交流"
              />
              <QuickActionButton
                href="/tasks"
                icon={Zap}
                label="创建任务"
                description="分配新任务给Agent"
              />
              <QuickActionButton
                href="/agents"
                icon={Users}
                label="管理Agent"
                description="查看和管理所有Agent"
              />
            </div>
          </div>

          {/* 最近活动 */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">最近活动</h2>
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <activity.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.message}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 系统状态 */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">系统状态</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API 连接</span>
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  正常
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">WebSocket</span>
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  已连接
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">系统负载</span>
                <span className="text-sm font-medium">
                  {Math.round((onlineAgents / (totalAgents || 1)) * 100)}%
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
    <Link href={href} className="block">
      <div className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <TrendingUp
            className={`h-4 w-4 ${trendUp ? "text-green-500" : "text-gray-400"}`}
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
