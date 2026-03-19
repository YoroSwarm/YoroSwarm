'use client';

import { create } from 'zustand';
import { api } from '@/lib/api/client';

export type LlmProvider = 'ANTHROPIC';
export type LlmAuthMode = 'BEARER_TOKEN' | 'X_API_KEY';

export type LlmConfigUsage = 'LEAD' | 'TEAMMATE' | 'BOTH';

export interface LlmApiConfig {
  id: string;
  userId: string;
  provider: LlmProvider;
  name: string;
  apiKey: string;
  baseUrl: string | null;
  defaultModel: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  temperature: number;
  authMode: LlmAuthMode;
  customHeaders?: string; // JSON string
  leadPriority: number;
  teammatePriority: number;
  isEnabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateLlmApiConfigInput {
  provider: LlmProvider;
  name: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  authMode?: LlmAuthMode;
  customHeaders?: string;
}

interface UpdateLlmApiConfigInput {
  name?: string;
  apiKey?: string;
  baseUrl?: string | null;
  defaultModel?: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  authMode?: LlmAuthMode;
  customHeaders?: string;
  isEnabled?: boolean;
}

interface LlmConfigsState {
  configs: LlmApiConfig[];
  isLoading: boolean;
  hasConfig: boolean;
  error: string | null;
  loadConfigs: () => Promise<void>;
  loadHasConfig: () => Promise<void>;
  createConfig: (input: CreateLlmApiConfigInput) => Promise<LlmApiConfig>;
  updateConfig: (id: string, input: UpdateLlmApiConfigInput) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  reorderLeadConfigs: (configs: Array<{ id: string; leadPriority: number }>) => Promise<void>;
  reorderTeammateConfigs: (configs: Array<{ id: string; teammatePriority: number }>) => Promise<void>;
  toggleConfig: (id: string, isEnabled: boolean) => Promise<void>;
}

const DEFAULT_MODEL_MAP: Record<LlmProvider, string> = {
  ANTHROPIC: 'claude-sonnet-4-20250514',
};

export const useLlmConfigsStore = create<LlmConfigsState>()((set, get) => ({
  configs: [],
  isLoading: false,
  hasConfig: false,
  error: null,

  loadConfigs: async () => {
    set({ isLoading: true, error: null });
    try {
      const configs = await api.get<LlmApiConfig[]>('/llm-configs');
      set({ configs, isLoading: false });
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to load configs:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load configs',
        isLoading: false,
      });
    }
  },

  loadHasConfig: async () => {
    try {
      const result = await api.get<{ hasConfig: boolean; count: number }>('/llm-configs/active');
      set({ hasConfig: result.hasConfig });
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to check has config:', error);
      set({ hasConfig: false });
    }
  },

  createConfig: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const config = await api.post<LlmApiConfig>('/llm-configs', {
        ...input,
        defaultModel: input.defaultModel || DEFAULT_MODEL_MAP[input.provider],
      });

      set((state) => ({
        configs: [...state.configs, config],
        hasConfig: true,
        isLoading: false,
      }));

      return config;
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to create config:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create config',
        isLoading: false,
      });
      throw error;
    }
  },

  updateConfig: async (id, input) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.patch<LlmApiConfig>(`/llm-configs/${id}`, input);

      set((state) => ({
        configs: state.configs.map((c) => (c.id === id ? updated : c)),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to update config:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update config',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteConfig: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/llm-configs/${id}`);

      set((state) => ({
        configs: state.configs.filter((c) => c.id !== id),
        isLoading: false,
      }));

      // Check if there are still enabled configs
      const remainingEnabled = get().configs.filter((c) => c.isEnabled && c.id !== id);
      if (remainingEnabled.length === 0) {
        set({ hasConfig: false });
      }
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to delete config:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete config',
        isLoading: false,
      });
      throw error;
    }
  },

  reorderLeadConfigs: async (configs) => {
    set({ isLoading: true, error: null });
    try {
      await api.put('/llm-configs/reorder-lead', { configs });

      // Update local state with new priorities
      set((state) => {
        const priorityMap = new Map(configs.map((c) => [c.id, c.leadPriority]));
        const reordered = [...state.configs].map((config) => ({
          ...config,
          leadPriority: priorityMap.get(config.id) ?? config.leadPriority,
        }));

        return { configs: reordered, isLoading: false };
      });
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to reorder lead configs:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to reorder configs',
        isLoading: false,
      });
      throw error;
    }
  },

  reorderTeammateConfigs: async (configs) => {
    set({ isLoading: true, error: null });
    try {
      await api.put('/llm-configs/reorder-teammate', { configs });

      // Update local state with new priorities
      set((state) => {
        const priorityMap = new Map(configs.map((c) => [c.id, c.teammatePriority]));
        const reordered = [...state.configs].map((config) => ({
          ...config,
          teammatePriority: priorityMap.get(config.id) ?? config.teammatePriority,
        }));

        return { configs: reordered, isLoading: false };
      });
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to reorder teammate configs:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to reorder configs',
        isLoading: false,
      });
      throw error;
    }
  },

  toggleConfig: async (id, isEnabled) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.patch<LlmApiConfig>(`/llm-configs/${id}`, { isEnabled });

      set((state) => ({
        configs: state.configs.map((c) => (c.id === id ? updated : c)),
        isLoading: false,
      }));

      // Update hasConfig based on enabled configs
      const enabledConfigs = get().configs.filter((c) => c.isEnabled || (c.id === id && isEnabled));
      set({ hasConfig: enabledConfigs.length > 0 });
    } catch (error) {
      console.error('[LlmConfigsStore] Failed to toggle config:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle config',
        isLoading: false,
      });
      throw error;
    }
  },
}));
