'use client';

import { cn } from '@/lib/utils';

interface SwarmLoaderProps {
  text?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Swarm 特色加载组件 — 六边形蜂巢网络脉冲动画
 */
export function SwarmLoader({ text = '加载中...', className, size = 'md' }: SwarmLoaderProps) {
  const scale = size === 'sm' ? 0.6 : size === 'lg' ? 1.3 : 1;
  const w = Math.round(64 * scale);
  const h = Math.round(56 * scale);

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 64 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-70"
      >
        {/* 中心六边形 */}
        <polygon
          points="32,20 40,24.6 40,33.8 32,38.4 24,33.8 24,24.6"
          className="fill-primary/30 stroke-primary/50"
          strokeWidth="0.8"
        >
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.8s" repeatCount="indefinite" begin="0s" />
        </polygon>

        {/* 上方 */}
        <polygon
          points="32,4 40,8.6 40,17.8 32,22.4 24,17.8 24,8.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="0.3s" />
        </polygon>

        {/* 右上 */}
        <polygon
          points="46,12 54,16.6 54,25.8 46,30.4 38,25.8 38,16.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
        </polygon>

        {/* 右下 */}
        <polygon
          points="46,28 54,32.6 54,41.8 46,46.4 38,41.8 38,32.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
        </polygon>

        {/* 下方 */}
        <polygon
          points="32,36 40,40.6 40,49.8 32,54.4 24,49.8 24,40.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="1.2s" />
        </polygon>

        {/* 左下 */}
        <polygon
          points="18,28 26,32.6 26,41.8 18,46.4 10,41.8 10,32.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="1.5s" />
        </polygon>

        {/* 左上 */}
        <polygon
          points="18,12 26,16.6 26,25.8 18,30.4 10,25.8 10,16.6"
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" repeatCount="indefinite" begin="0s" />
        </polygon>

        {/* 连线：中心到各节点 */}
        <line x1="32" y1="29" x2="32" y2="22" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="0.15s" />
        </line>
        <line x1="32" y1="29" x2="40" y2="25" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="0.45s" />
        </line>
        <line x1="32" y1="29" x2="40" y2="33" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="0.75s" />
        </line>
        <line x1="32" y1="29" x2="32" y2="36" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="1.05s" />
        </line>
        <line x1="32" y1="29" x2="24" y2="33" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="1.35s" />
        </line>
        <line x1="32" y1="29" x2="24" y2="25" className="stroke-primary/20" strokeWidth="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.8s" repeatCount="indefinite" begin="0s" />
        </line>

        {/* 中心节点 */}
        <circle cx="32" cy="29" r="2" className="fill-primary/60">
          <animate attributeName="r" values="1.5;2.5;1.5" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>

      {text && (
        <span className="text-xs text-muted-foreground/70 animate-pulse">{text}</span>
      )}
    </div>
  );
}
