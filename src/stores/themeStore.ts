'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Theme, ThemeState } from '@/types/index';

interface ThemeActions {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

type ThemeStore = ThemeState & ThemeActions;

const _getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const applyTheme = (theme: 'light' | 'dark') => {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: 'light',

      setTheme: (_theme) => {
        // Force light mode
        applyTheme('light');
        set({ theme: 'light', resolvedTheme: 'light' });
      },

      toggleTheme: () => {
        // No-op or force light
        applyTheme('light');
        set({ theme: 'light', resolvedTheme: 'light' });
      },

      initTheme: () => {
        applyTheme('light');
        set({ theme: 'light', resolvedTheme: 'light' });
      },
    }),
    {
      name: 'swarm-theme-storage',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      skipHydration: true,
    }
  )
);
