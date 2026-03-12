'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { StoreProvider } from '@/components/providers/StoreProvider';

function ThemeInit() {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ThemeInit />
      {children}
    </StoreProvider>
  );
}
