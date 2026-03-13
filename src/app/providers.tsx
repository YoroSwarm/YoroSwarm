'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { StoreProvider } from '@/components/providers/StoreProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

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
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </StoreProvider>
  );
}
