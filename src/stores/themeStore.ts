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

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const resolveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
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
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',

      setTheme: (newTheme) => {
        const resolved = resolveTheme(newTheme);
        applyTheme(resolved);
        set({ theme: newTheme, resolvedTheme: resolved });
      },

      toggleTheme: () => {
        const currentTheme = get().theme;
        let newTheme: Theme;

        if (currentTheme === 'light') {
          newTheme = 'dark';
        } else if (currentTheme === 'dark') {
          newTheme = 'system';
        } else {
          // system -> toggle based on current resolved
          newTheme = get().resolvedTheme === 'light' ? 'dark' : 'light';
        }

        const resolved = resolveTheme(newTheme);
        applyTheme(resolved);
        set({ theme: newTheme, resolvedTheme: resolved });
      },

      initTheme: () => {
        const { theme } = get();
        const resolved = resolveTheme(theme);
        applyTheme(resolved);
        set({ resolvedTheme: resolved });
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
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.theme);
          applyTheme(resolved);
          state.resolvedTheme = resolved;
        }
      },
    }
  )
);

// 监听系统主题变化
// 使用模块级变量确保监听器只在首次加载时添加，避免 HMR 重复注册
if (typeof window !== 'undefined' && !window.__themeMediaQueryListenerAttached) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    const store = useThemeStore.getState();
    if (store.theme === 'system') {
      const resolved = getSystemTheme();
      applyTheme(resolved);
      store.resolvedTheme = resolved;
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  window.__themeMediaQueryListenerAttached = true;
}
