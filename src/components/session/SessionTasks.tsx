import { useState, useEffect, useCallback } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { useAgents } from "@/hooks/use-agents";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Loader2
} from "lucide-react";
import { Task } from "@/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SessionTasksProps {
  sessionId: string;
}

export function SessionTasks({ sessionId }: SessionTasksProps) {
  const { tasks, isLoading } = useTasks({ 
    swarmSessionId: sessionId,
    autoLoad: true 
  });
  const { agents } = useAgents({ autoLoad: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Task["status"] | "all">("all");

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getAgentName = (agentId?: string) => {
    if (!agentId) return "未分配";
    return agents.find(a => a.id === agentId)?.name || "未知 Agent";
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 input-hand"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Task["status"] | "all")}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm h-10 w-32 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-border rounded-xl">
            <Clock className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">暂无任务</p>
            <p className="text-sm mt-1">任务将由 Agent 自动创建</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div key={task.id} className="card-hand p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:shadow-md transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-lg truncate">{task.title}</p>
                    <TaskPriorityBadge priority={task.priority} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {task.description || "无描述"}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">分配给:</span>
                    <span className="text-xs font-bold px-2 py-1 bg-muted rounded border border-border">
                      {getAgentName(task.assignedTo)}
                    </span>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: Task["status"] }) {
  const config = {
    pending: { label: "待处理", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    in_progress: { label: "进行中", className: "bg-blue-100 text-blue-800 border-blue-300" },
    completed: { label: "已完成", className: "bg-green-100 text-green-800 border-green-300" },
    failed: { label: "失败", className: "bg-red-100 text-red-800 border-red-300" },
    cancelled: { label: "已取消", className: "bg-gray-100 text-gray-800 border-gray-300" },
  };

  const { label, className } = config[status];
  return (
    <span className={cn("px-3 py-1 text-xs font-bold border-2 rounded-full transform -rotate-2 inline-block", className)}>
      {label}
    </span>
  );
}

function TaskPriorityBadge({ priority }: { priority: Task["priority"] }) {
  const config = {
    low: { label: "低", className: "text-gray-500 bg-gray-100" },
    medium: { label: "中", className: "text-blue-600 bg-blue-100" },
    high: { label: "高", className: "text-red-600 bg-red-100" },
  };

  const { label, className } = config[priority];
  return (
    <span className={cn("px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm", className)}>
      {label}
    </span>
  );
}

