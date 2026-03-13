"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { useAgents } from "@/hooks/use-agents";
import { useAgentWebSocket } from "@/hooks/use-agent-websocket";
import { storage } from "@/utils/storage";
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { Task } from "@/types/agent";

const CURRENT_SESSION_STORAGE_KEY = 'current_swarm_session_id';

export default function TasksPage() {
  const { tasks, isLoading, loadTasks } = useTasks({ autoLoad: true });
  const { agents, loadAgents } = useAgents({ autoLoad: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Task["status"] | "all">("all");

  // Resolve session ID for WebSocket connection
  const [swarmSessionId, setSwarmSessionId] = useState<string | undefined>();
  useEffect(() => {
    setSwarmSessionId(storage.get<string>(CURRENT_SESSION_STORAGE_KEY) || undefined);
  }, []);

  // Debounced refresh on WebSocket events
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void loadTasks();
      void loadAgents();
    }, 300);
  }, [loadTasks, loadAgents]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const { isConnected, isConnecting } = useAgentWebSocket({
    swarmSessionId,
    autoConnect: !!swarmSessionId,
    onTaskUpdate: debouncedRefresh, 
    onAgentStatus: debouncedRefresh,
  });

  // 过滤任务
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // 统计
  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold font-heading">任务管理</h1>
            <p className="text-muted-foreground mt-1 font-body">
              查看任务列表、分配和跟踪进度 (只读)
            </p>
          </div>
          {swarmSessionId && (
            <span
              title={
                isConnected
                  ? "实时连接已建立"
                  : isConnecting
                    ? "正在连接..."
                    : "实时连接断开"
              }
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border bg-white"
            >
              {isConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <Wifi className="h-3 w-3 text-green-600" />
                </>
              ) : isConnecting ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  <Wifi className="h-3 w-3 text-yellow-600" />
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <WifiOff className="h-3 w-3 text-gray-400" />
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="总任务" value={stats.total} icon={Clock} color="blue" />
        <StatCard title="待处理" value={stats.pending} icon={AlertCircle} color="yellow" />
        <StatCard title="进行中" value={stats.inProgress} icon={Clock} color="blue" />
        <StatCard title="已完成" value={stats.completed} icon={CheckCircle2} color="green" />
      </div>

      {/* 过滤和搜索 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border-2 border-border bg-background input-hand"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Task["status"] | "all")}
            className="px-3 py-2 rounded-lg border-2 border-border bg-background font-body text-sm"
            style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="rounded-xl border-2 border-border bg-card overflow-hidden wobbly-box-md">
        <div className="overflow-x-auto">
          <table className="w-full font-body">
            <thead>
              <tr className="border-b-2 border-border bg-muted/20">
                <th className="px-4 py-3 text-left text-sm font-bold font-heading">任务</th>
                <th className="px-4 py-3 text-left text-sm font-bold font-heading">状态</th>
                <th className="px-4 py-3 text-left text-sm font-bold font-heading">优先级</th>
                <th className="px-4 py-3 text-left text-sm font-bold font-heading">分配</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    暂无任务
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold">{task.title}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                          {task.description || "无描述"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3">
                      <TaskPriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-4 py-3">
                      {task.assignedTo ? (
                        <span className="text-sm font-bold px-2 py-1 bg-white border border-border rounded-md inline-block transform rotate-1">
                          {agents.find((a) => a.id === task.assignedTo)?.name || "Unknown"}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">未分配</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: "blue" | "yellow" | "green" | "red";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
    green: "bg-green-100 text-green-700 border-green-200",
    red: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="card-hand p-4 transition-transform hover:-translate-y-1">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center border-2 ${colorClasses[color]}`} style={{ borderRadius: "10px 15px 10px 15px / 15px 10px 15px 10px" }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-muted-foreground font-body">{title}</p>
          <p className="text-2xl font-bold font-heading">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: Task["status"] }) {
  const config = {
    pending: { label: "待处理", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    in_progress: { label: "进行中", className: "bg-blue-100 text-blue-700 border-blue-200" },
    completed: { label: "已完成", className: "bg-green-100 text-green-700 border-green-200" },
    failed: { label: "失败", className: "bg-red-100 text-red-700 border-red-200" },
    cancelled: { label: "已取消", className: "bg-gray-100 text-gray-700 border-gray-200" },
  };

  const { label, className } = config[status];
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold border-2 ${className}`}>
      {label}
    </span>
  );
}

function TaskPriorityBadge({ priority }: { priority: Task["priority"] }) {
  const config = {
    low: { label: "低", className: "bg-gray-100 text-gray-700 border-gray-200" },
    medium: { label: "中", className: "bg-blue-100 text-blue-700 border-blue-200" },
    high: { label: "高", className: "bg-red-100 text-red-700 border-red-200" },
  };

  const { label, className } = config[priority];
  return (
    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}
