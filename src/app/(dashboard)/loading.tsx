'use client';

import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6">
      {/* 页面标题 skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
          <div className="h-4 w-48 bg-muted/50 animate-pulse rounded-md mt-2" />
        </div>
        <div className="h-6 w-24 bg-muted animate-pulse rounded-md" />
      </div>

      {/* 统计卡片 skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card-hand p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="h-3 w-20 bg-muted/50 animate-pulse rounded-md" />
                <div className="h-9 w-16 bg-muted animate-pulse rounded-md mt-2" />
              </div>
              <div className="h-10 w-10 bg-muted/50 animate-pulse rounded-lg" />
            </div>
            <div className="h-4 w-24 bg-muted/30 animate-pulse rounded-md mt-4" />
          </div>
        ))}
      </div>

      {/* 主要内容区域 skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card-hand p-6">
            <div className="h-5 w-32 bg-muted/50 animate-pulse rounded-md mb-4" />
            <div className="h-64 bg-muted/30 animate-pulse rounded-md" />
          </div>
          <div className="card-hand p-6">
            <div className="h-5 w-24 bg-muted/50 animate-pulse rounded-md mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-border/50 bg-muted/30 animate-pulse rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                    <div>
                      <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
                      <div className="h-3 w-20 bg-muted/50 animate-pulse rounded-md mt-1" />
                    </div>
                  </div>
                  <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="card-hand p-6">
            <div className="h-5 w-24 bg-muted/50 animate-pulse rounded-md mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted/30 animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
          <div className="card-hand p-6">
            <div className="h-5 w-24 bg-muted/50 animate-pulse rounded-md mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-20 bg-muted/50 animate-pulse rounded-md" />
                  <div className="h-4 w-16 bg-muted animate-pulse rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
