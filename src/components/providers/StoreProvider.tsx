'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores';
import { appConfig } from '@/lib/config/app';

interface StoreProviderProps {
  children: ReactNode;
}

/**
 * StoreProvider handles hydration of Zustand stores in Next.js
 * This prevents hydration mismatches between server and client
 */
export function StoreProvider({ children }: StoreProviderProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    useAuthStore.persist.rehydrate();

    const splashMinTime = new Promise<void>(r => setTimeout(r, 1200));

    Promise.all([
      checkAuth().finally(() => setIsHydrated(true)),
      splashMinTime,
    ]).then(() => setShowSplash(false));
  }, [checkAuth]);

  if (!isHydrated || showSplash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center justify-center">
          <img src="/icon.svg" alt={appConfig.name} className="w-20 h-20" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
