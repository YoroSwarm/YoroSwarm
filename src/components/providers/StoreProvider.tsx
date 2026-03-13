'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores';

interface StoreProviderProps {
  children: ReactNode;
}

/**
 * StoreProvider handles hydration of Zustand stores in Next.js
 * This prevents hydration mismatches between server and client
 */
export function StoreProvider({ children }: StoreProviderProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    // Rehydrate stores
    useAuthStore.persist.rehydrate();

    // Check authentication status
    checkAuth().finally(() => {
      setIsHydrated(true);
    });
  }, [checkAuth]);

  // Prevent flash of unauthenticated content
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
