'use client';

import { useEffect } from 'react';
import { appConfig } from '@/lib/config/app';
import { useThemeStore } from '@/stores';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const initTheme = useThemeStore((state) => state.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <div className="min-h-screen bg-linear-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center shadow-lg border border-border/50">
            <img src="/icon.svg" alt={appConfig.name} className="w-8 h-8" />
          </div>
          <span className="text-2xl font-bold text-foreground">{appConfig.name}</span>
        </div>

        {/* 内容区域 */}
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 animate-scale-in">
          {children}
        </div>

        {/* 底部版权 */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          © 2026 {appConfig.name}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
