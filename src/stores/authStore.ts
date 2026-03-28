'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, User } from '@/types/index';
import { authApi } from '@/lib/api/auth';
import { storage } from '@/lib/utils/storage';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth';

interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  updateUser: (updates: Partial<User>) => void;
  checkAuth: () => Promise<boolean>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login(credentials);
          const { user, tokens } = response;

          storage.set('access_token', tokens.accessToken);
          storage.set('refresh_token', tokens.refreshToken);
          // Clear old session data on login
          storage.remove('current_swarm_session_id');

          set({
            user,
            token: tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await authApi.register(credentials);
          const { user, tokens } = response;

          storage.set('access_token', tokens.accessToken);
          storage.set('refresh_token', tokens.refreshToken);
          // Clear old session data on registration
          storage.remove('current_swarm_session_id');

          set({
            user,
            token: tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          storage.remove('access_token');
          storage.remove('refresh_token');
          storage.remove('user');
          set({ ...initialState });
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },

      setToken: (token) => {
        set({ token });
        if (token) {
          storage.set('access_token', token);
        } else {
          storage.remove('access_token');
        }
      },

      updateUser: (updates) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...updates } });
        }
      },

      checkAuth: async () => {
        const token = storage.get<string>('access_token');
        if (!token) {
          return false;
        }

        set({ isLoading: true });
        try {
          const user = await authApi.getCurrentUser();
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        } catch {
          storage.remove('access_token');
          storage.remove('refresh_token');
          set({ ...initialState });
          return false;
        }
      },
    }),
    {
      name: 'swarm-auth-storage',
      partialize: (state) => ({ user: state.user }),
      // Fix hydration mismatch by using custom storage
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

// Hydration helper hook for Next.js
export const useAuthHydration = () => {
  const { checkAuth } = useAuthStore();

  const hydrate = async () => {
    await checkAuth();
  };

  return { hydrate };
};
