'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore, useLeadPreferencesStore } from '@/stores';
import { StoreProvider } from '@/components/providers/StoreProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { GlobalBackground } from '@/components/layout/GlobalBackground';
import { useSessionsInitPolling } from '@/hooks/use-sessions-init-polling';

function ThemeInit() {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return null;
}

function LeadPreferencesInit() {
  const { isAuthenticated } = useAuthStore();
  const { loadPreferences } = useLeadPreferencesStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPreferences();
  }, [isAuthenticated, loadPreferences]);

  return null;
}

function SessionsInitPolling() {
  useSessionsInitPolling(5000);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ThemeInit />
      <LeadPreferencesInit />
      <SessionsInitPolling />
      <GlobalBackground />
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </StoreProvider>
  );
}
