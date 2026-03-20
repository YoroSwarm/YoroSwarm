'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { Task } from '@/types/agent';
import { cn } from '@/lib/utils';

interface TaskFlowChartProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

interface TaskNode {
  task: Task;
  level: number;
  children: TaskNode[];
  parents: TaskNode[];
  x: number;
  y: number;
}

export function TaskFlowChart({ tasks, onTaskClick }: TaskFlowChartProps) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // 构建任务关系图
  const taskGraph = useMemo(() => {
    const taskMap = new Map<string, Task>();
    tasks.forEach(task => taskMap.set(task.id, task));

    // 构建节点和边
    const nodes: TaskNode[] = tasks.map(task => ({
      task,
      level: 0,
      children: [],
      parents: [],
      x: 0,
      y: 0
    }));

    const nodeMap = new Map<string, TaskNode>();
    nodes.forEach(node => nodeMap.set(node.task.id, node));

    // 建立关系
    nodes.forEach(node => {
      if (node.task.dependencyIds) {
        node.task.dependencyIds.forEach(depId => {
          const parentNode = nodeMap.get(depId);
          if (parentNode) {
            node.parents.push(parentNode);
            parentNode.children.push(node);
          }
        });
      }
    });

    // 计算层级（拓扑排序）
    const visited = new Set<string>();
    const calculateLevel = (node: TaskNode): number => {
      if (visited.has(node.task.id)) return node.level;
      visited.add(node.task.id);

      if (node.parents.length === 0) {
        node.level = 0;
      } else {
        const maxParentLevel = Math.max(...node.parents.map(p => calculateLevel(p)));
        node.level = maxParentLevel + 1;
      }
      return node.level;
    };

    nodes.forEach(node => calculateLevel(node));

    // 按层级分组
    const levels: TaskNode[][] = [];
    const maxLevel = Math.max(...nodes.map(n => n.level), 0);
    for (let i = 0; i <= maxLevel; i++) {
      levels.push(nodes.filter(n => n.level === i));
    }

    // 计算布局位置
    const nodeWidth = 200;
    const nodeHeight = 80;
    const horizontalSpacing = 40;
    const verticalSpacing = 100;
    const paddingTop = 60;
    const paddingLeft = 60;

    levels.forEach((levelNodes, levelIndex) => {
      const levelWidth = levelNodes.length * nodeWidth + (levelNodes.length - 1) * horizontalSpacing;
      const startX = paddingLeft;
      const startY = paddingTop + levelIndex * (nodeHeight + verticalSpacing);

      levelNodes.forEach((node, nodeIndex) => {
        // 居中对齐父节点
        if (node.parents.length > 0) {
          const avgParentX = node.parents.reduce((sum, p) => sum + p.x, 0) / node.parents.length;
          node.x = avgParentX;
        } else {
          node.x = startX + nodeIndex * (nodeWidth + horizontalSpacing) + nodeWidth / 2;
        }

        // 简单的防重叠调整
        const sameLevelNodes = levels[levelIndex];
        const nodeIndexInLevel = sameLevelNodes.indexOf(node);
        if (nodeIndexInLevel > 0) {
          const prevNode = sameLevelNodes[nodeIndexInLevel - 1];
          if (node.x - prevNode.x < nodeWidth + horizontalSpacing) {
            node.x = prevNode.x + nodeWidth + horizontalSpacing;
          }
        }

        node.y = startY + nodeHeight / 2;
      });
    });

    // 计算画布尺寸
    let maxX = 0, maxY = 0;
    nodes.forEach(node => {
      maxX = Math.max(maxX, node.x + nodeWidth / 2);
      maxY = Math.max(maxY, node.y + nodeHeight / 2);
    });

    return { nodes, nodeMap, levels, width: maxX + paddingLeft, height: maxY + paddingTop };
  }, [tasks]);

  // 更新 SVG 尺寸
  useEffect(() => {
    if (svgRef.current && taskGraph.width > 0 && taskGraph.height > 0) {
      setDimensions({
        width: Math.max(taskGraph.width + 100, 800),
        height: Math.max(taskGraph.height + 100, 600)
      });
    }
  }, [taskGraph]);

  // 获取任务节点颜色
  const getTaskColor = (status: Task['status'], isSelected: boolean, isHovered: boolean) => {
    if (isSelected) return 'bg-primary text-primary-foreground border-primary';
    if (isHovered) return 'bg-accent border-accent-foreground';

    const statusColors = {
      pending: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700',
      in_progress: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700',
      completed: 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700',
      failed: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700',
      cancelled: 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
    };
    return statusColors[status];
  };

  // 获取任务节点边框样式
  const getTaskBorderClass = (task: Task, isSelected: boolean, isHovered: boolean) => {
    if (isSelected) return 'border-2 border-primary';
    if (isHovered) return 'border-2 border-accent-foreground';

    const statusBorders = {
      pending: 'border-2 border-yellow-400 dark:border-yellow-600',
      in_progress: 'border-2 border-blue-400 dark:border-blue-600',
      completed: 'border-2 border-green-400 dark:border-green-600',
      failed: 'border-2 border-red-400 dark:border-red-600',
      cancelled: 'border-2 border-gray-400 dark:border-gray-600'
    };
    return statusBorders[task.status];
  };

  // 生成连接线路径
  const generateConnectionPath = (parent: TaskNode, child: TaskNode) => {
    const parentX = parent.x;
    const parentIsSelected = selectedTask === parent.task.id;
    const childIsSelected = selectedTask === child.task.id;
    const parentHeight = parentIsSelected ? 60 : 40;
    const childHeight = childIsSelected ? 60 : 40;

    const parentY = parent.y + parentHeight;
    const childX = child.x;
    const childY = child.y - childHeight;

    const midY = (parentY + childY) / 2;

    return `M ${parentX} ${parentY} C ${parentX} ${midY}, ${childX} ${midY}, ${childX} ${childY}`;
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task.id === selectedTask ? null : task.id);
    onTaskClick?.(task);
  };

  return (
    <div className="w-full h-full overflow-auto bg-muted/20 rounded-xl border border-border">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="overflow-visible"
        style={{ minWidth: '100%', minHeight: '100%' }}
      >
        <defs>
          {/* 箭头标记 */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              className="fill-muted-foreground"
            />
          </marker>
          {/* 高亮箭头标记 */}
          <marker
            id="arrowhead-highlight"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              className="fill-primary"
            />
          </marker>
        </defs>

        {/* 连接线 */}
        {taskGraph.nodes.map(node => (
          node.children.map(child => {
            const isHighlighted = selectedTask && (node.task.id === selectedTask || child.task.id === selectedTask);
            const isConnectedToHovered = hoveredTask && (node.task.id === hoveredTask || child.task.id === hoveredTask);

            return (
              <path
                key={`${node.task.id}-${child.task.id}`}
                d={generateConnectionPath(node, child)}
                className={cn(
                  "fill-none stroke-2 transition-all duration-300",
                  isHighlighted || isConnectedToHovered
                    ? "stroke-primary stroke-[3px]"
                    : "stroke-muted-foreground/50"
                )}
                markerEnd={
                  isHighlighted || isConnectedToHovered
                    ? "url(#arrowhead-highlight)"
                    : "url(#arrowhead)"
                }
                style={{ opacity: (selectedTask && !isHighlighted) ? 0.2 : 1 }}
              />
            );
          })
        ))}

        {/* 任务节点 */}
        {taskGraph.nodes.map(node => {
          const isSelected = selectedTask === node.task.id;
          const isHovered = hoveredTask === node.task.id;
          const isRelatedToSelected = selectedTask && (
            node.task.id === selectedTask ||
            node.task.dependencyIds?.includes(selectedTask) ||
            taskGraph.nodeMap.get(selectedTask)?.dependencyIds?.includes(node.task.id)
          );

          const opacity = (selectedTask && !isRelatedToSelected) ? 0.2 : 1;

          return (
            <g
              key={node.task.id}
              transform={`translate(${node.x - 100}, ${node.y - (isSelected ? 60 : 40)})`}
              className={cn("cursor-pointer transition-all duration-300", isSelected && "scale-105")}
              onClick={() => handleTaskClick(node.task)}
              onMouseEnter={() => setHoveredTask(node.task.id)}
              onMouseLeave={() => setHoveredTask(null)}
              style={{ opacity }}
            >
              {/* 节点背景 */}
              <foreignObject
                x="0"
                y="0"
                width="200"
                height={isSelected ? 120 : 80}
                className="overflow-visible"
              >
                <div
                  className={cn(
                    "w-full rounded-xl p-3 transition-all duration-300 shadow-sm",
                    getTaskColor(node.task.status, isSelected, isHovered),
                    getTaskBorderClass(node.task, isSelected, isHovered),
                    isSelected && "shadow-lg"
                  )}
                  style={{
                    borderRadius: "12px",
                    border: "2px solid",
                    borderColor: isSelected ? "hsl(var(--primary))" :
                             isHovered ? "hsl(var(--accent-foreground))" :
                             node.task.status === 'pending' ? "#fde047" :
                             node.task.status === 'in_progress' ? "#60a5fa" :
                             node.task.status === 'completed' ? "#4ade80" :
                             node.task.status === 'failed' ? "#f87171" : "#9ca3af",
                    minHeight: isSelected ? 120 : 80,
                  }}
                >
                  <div className="flex flex-col">
                    {/* 任务标题 */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        node.task.status === 'pending' ? "bg-yellow-500" :
                        node.task.status === 'in_progress' ? "bg-blue-500 animate-pulse" :
                        node.task.status === 'completed' ? "bg-green-500" :
                        node.task.status === 'failed' ? "bg-red-500" : "bg-gray-500"
                      )} />
                      <h4 className="font-semibold text-sm truncate flex-1">
                        {node.task.title}
                      </h4>
                    </div>

                    {/* 任务描述 */}
                    <p className={cn(
                      "text-xs opacity-80",
                      isSelected ? "" : "line-clamp-2"
                    )}>
                      {node.task.description || '无描述'}
                    </p>

                    {/* 底部信息 */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/10">
                        {node.task.status === 'pending' ? '待处理' :
                         node.task.status === 'in_progress' ? '进行中' :
                         node.task.status === 'completed' ? '已完成' :
                         node.task.status === 'failed' ? '失败' : '已取消'}
                      </span>
                      {node.task.dependencyIds && node.task.dependencyIds.length > 0 && (
                        <span className="text-[10px] opacity-60">
                          依赖: {node.task.dependencyIds.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur rounded-lg p-3 border border-border shadow-sm">
        <h4 className="text-xs font-semibold mb-2">状态图例</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>待处理</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span>进行中</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>已完成</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>失败</span>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      {tasks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium">暂无任务</p>
            <p className="text-sm mt-1">任务将由 Agent 自动创建</p>
          </div>
        </div>
      )}

      {tasks.length > 0 && !taskGraph.nodes.some(n => n.task.dependencyIds && n.task.dependencyIds.length > 0) && (
        <div className="absolute top-4 right-4 bg-background/95 backdrop-blur rounded-lg px-3 py-2 border border-border shadow-sm text-xs text-muted-foreground">
          💡 当前任务没有前置依赖关系
        </div>
      )}
    </div>
  );
}
