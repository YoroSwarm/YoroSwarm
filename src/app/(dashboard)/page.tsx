"use client";

import { useTasks } from "@/hooks/use-tasks";
import { useTeamStats } from "@/hooks/use-team-stats";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  CheckCircle2,
  Clock,
  Zap,
  MessageSquare,
  Settings,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils/date";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const HITOKOTO_QUOTES = [
  "小小微躯能负重，嚣嚣薄翅会乘风。",
  "空中蜂队如车轮，中有王子蜂中尊。",
  "但得蜜成甘众口，一身虽苦又何妨。",
  "作蜜不忙采蜜忙，蜜成犹带百花香。",
  "穿花度柳飞如箭，粘絮寻香似落星。",
  "醉后不知天在水，满船清梦压星河。",
  "苔花如米小，也学牡丹开。",
  "月到天心处，风来水面时。",
  "似此星辰非昨夜，为谁风露立中宵。",
  "微微风簇浪，散作满河星。",
  "深处种菱浅种稻，不深不浅种荷花。",
  "田夫抛秧田妇接，小儿拔秧大儿插。",
  "松月生夜凉，风泉满清听。",
  "空山松子落，幽人应未眠。",
  "溪花与禅意，相对亦忘言。",
];

const RANDOM_QUOTE = HITOKOTO_QUOTES[Math.floor(Math.random() * HITOKOTO_QUOTES.length)];

interface HourlyUsage {
  hour: string;
  input: number;
  output: number;
  cache: number;
  total: number;
}

interface UsageTotals {
  input: number;
  output: number;
  cache: number;
  total: number;
  cache_hit_rate: number;
}

function useHourlyUsage(pollInterval = 30000) {
  const [data, setData] = useState<HourlyUsage[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/usage');
      if (res.ok) {
        const json = await res.json();
        setData(json.data?.hourly || []);
        setTotals(json.data?.totals || null);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (pollInterval <= 0) return;
    const timer = setInterval(() => { void load(); }, pollInterval);
    return () => clearInterval(timer);
  }, [load, pollInterval]);

  return { data, totals, isLoading, reload: load };
}

export default function DashboardPage() {
  const { tasks, isLoading: isTasksLoading } = useTasks({ autoLoad: true, pollInterval: 10000 });
  const {
    totalAgents,
    totalTasks,
    completedTasks,
    isLoading: isStatsLoading,
  } = useTeamStats();
  const { data: hourlyData, totals: usageTotals, isLoading: isChartLoading } = useHourlyUsage();

  const isLoading = isTasksLoading || isStatsLoading;

  const quote = RANDOM_QUOTE;

  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;

  const totalTokens = usageTotals?.total || 0;
  const inputTokens = usageTotals?.input || 0;
  const outputTokens = usageTotals?.output || 0;
  const cacheTokens = usageTotals?.cache || 0;
  const cacheHitRate = usageTotals?.cache_hit_rate || 0;

  const recentActivities = tasks
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 8)
    .map((task) => ({
      id: task.id,
      type: 'task',
      title: task.title,
      status: task.status,
      time: formatTimeAgo(task.updatedAt || task.createdAt),
      icon: task.status === 'completed' ? CheckCircle2 : task.status === 'in_progress' ? Clock : Zap
    }));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 + 一言 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">概览</h1>
          <p className="text-muted-foreground mt-1">
            {quote || "…"}
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
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
          <StatCard
            title="Agent 数量"
            value={String(totalAgents)}
            icon={Users}
            trend="集群成员"
            trendUp={totalAgents > 0}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
          <StatCard
            title="进行中任务"
            value={String(inProgressTasks)}
            icon={Clock}
            trend={`${pendingTasks} 待处理`}
            trendUp={inProgressTasks > 0}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
          <StatCard
            title="已完成任务"
            value={String(completedTasks)}
            icon={CheckCircle2}
            trend={`${totalTasks} 总计`}
            trendUp={true}
          />
        </motion.div>
      </motion.div>

      {/* 主要内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Token 用量卡片 */}
          <div className="card-hand p-6">
            <div className="flex items-center justify-between mb-2 border-b border-border/50 pb-2">
              <h2 className="text-lg font-semibold">Token 用量 <span className="text-sm font-normal text-muted-foreground ml-2">24小时</span></h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>总计 <strong className="text-foreground">{formatTokenCount(totalTokens)}</strong></span>
                <span>输入 <strong className="text-foreground">{formatTokenCount(inputTokens)}</strong></span>
                <span>输出 <strong className="text-foreground">{formatTokenCount(outputTokens)}</strong></span>
                <span>缓存 <strong className="text-foreground">{formatTokenCount(cacheTokens)}</strong></span>
                <span className="border-l border-border pl-3">命中率 <strong className="text-foreground">{(cacheHitRate * 100).toFixed(1)}%</strong></span>
              </div>
            </div>
            <div className="h-64 mt-4">
              {isChartLoading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">加载中...</div>
              ) : hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a0a0a0" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#a0a0a0" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4d4d4" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#d4d4d4" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6b9fff" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6b9fff" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11, fill: '#888' }}
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#888' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatTokenCount}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#999' }}
                      formatter={(value, name) => [
                        formatTokenCount(Number(value)),
                        name === 'input' ? '输入' : name === 'output' ? '输出' : '缓存',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="input"
                      stroke="#a0a0a0"
                      fill="url(#colorInput)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="output"
                      stroke="#d4d4d4"
                      fill="url(#colorOutput)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="cache"
                      stroke="#6b9fff"
                      fill="url(#colorCache)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  暂无用量数据
                </div>
              )}
            </div>
          </div>

          {/* 最近活动 */}
          <div className="card-hand p-6">
            <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
              <h2 className="text-lg font-semibold">最近活动</h2>
            </div>
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-border/50">
                      <activity.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold border-2 ${
                      activity.status === "completed"
                        ? "bg-green-100 text-green-800 border-green-200"
                        : activity.status === "in_progress"
                        ? "bg-blue-100 text-blue-800 border-blue-200"
                        : activity.status === "pending"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-gray-100 text-gray-800 border-gray-200"
                    }`}
                  >
                    {activity.status === "completed"
                      ? "已完成"
                      : activity.status === "in_progress"
                      ? "进行中"
                      : activity.status === "pending"
                      ? "待处理"
                      : activity.status}
                  </span>
                </div>
              ))}
              {recentActivities.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无活动</p>
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
                <span className="text-sm text-muted-foreground">Agent 数量</span>
                <span className="text-sm font-bold">{totalAgents}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  trend: string;
  trendUp: boolean;
}) {
  return (
    <div className="card-hand p-6">
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
  );
}

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
