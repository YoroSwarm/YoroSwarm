'use client';

import { create } from 'zustand';
import { api } from '@/lib/api/client';
import { DEFAULT_LEAD_AGENTS_MD, DEFAULT_LEAD_SOUL_MD } from '@/lib/constants/lead-preferences';

// 检查配置是否与默认值相同
function isUsingDefaults(agentsMd: string | null, soulMd: string | null): boolean {
  const agentsMatches = !agentsMd || agentsMd.trim() === DEFAULT_LEAD_AGENTS_MD.trim();
  const soulMatches = !soulMd || soulMd.trim() === DEFAULT_LEAD_SOUL_MD.trim();
  return agentsMatches && soulMatches;
}

interface LeadPreferencesState {
  agentsMd: string | null;
  soulMd: string | null;
  leadNickname: string | null;
  leadAvatarUrl: string | null;
  glassEffect: boolean;
  backgroundImage: string | null;
  timezone: string | null;
  autoArchiveDays: number;
  isCustomized: boolean;
  isLoading: boolean;
  lastUpdated: string | null;
  loadPreferences: () => Promise<void>;
  savePreferences: () => Promise<void>;
  setAgentsMd: (content: string) => void;
  setSoulMd: (content: string) => void;
  setLeadNickname: (name: string | null) => void;
  setLeadAvatarUrl: (url: string | null) => void;
  setGlassEffect: (value: boolean) => void;
  setBackgroundImage: (value: string | null) => void;
  setTimezone: (tz: string | null) => void;
  setAutoArchiveDays: (days: number) => void;
  resetToDefaults: () => void;
  // 用于 UI 显示的默认值
  getDisplayAgentsMd: () => string;
  getDisplaySoulMd: () => string;
}

export const useLeadPreferencesStore = create<LeadPreferencesState>()((set, get) => ({
  agentsMd: null,
  soulMd: null,
  leadNickname: null,
  leadAvatarUrl: null,
  glassEffect: false,
  backgroundImage: null,
  timezone: null,
  autoArchiveDays: 7,
  isCustomized: false,
  isLoading: false,
  lastUpdated: null,

  loadPreferences: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<{
        agentsMd: string | null;
        soulMd: string | null;
        leadNickname: string | null;
        leadAvatarUrl: string | null;
        glassEffect: boolean;
        backgroundImage: string | null;
        timezone: string | null;
        autoArchiveDays: number;
      }>('/lead/preferences');

      console.log('[LeadPreferencesStore] 加载配置:', {
        agentsMd: response.agentsMd?.substring(0, 50),
        soulMd: response.soulMd?.substring(0, 50),
      })

      set({
        agentsMd: response.agentsMd,
        soulMd: response.soulMd,
        leadNickname: response.leadNickname,
        leadAvatarUrl: response.leadAvatarUrl,
        glassEffect: Boolean(response.glassEffect),
        backgroundImage: response.backgroundImage,
        timezone: response.timezone,
        autoArchiveDays: response.autoArchiveDays ?? 7,
        isCustomized: !isUsingDefaults(response.agentsMd, response.soulMd),
        isLoading: false,
      });
    } catch (error) {
      console.error('[LeadPreferencesStore] Failed to load lead preferences:', error);
      set({ isLoading: false });
    }
  },

  savePreferences: async () => {
    const { agentsMd, soulMd, timezone, leadNickname, leadAvatarUrl, glassEffect, backgroundImage, autoArchiveDays } = get();
    console.log('[LeadPreferencesStore] 保存配置:', {
      agentsMd: agentsMd?.substring(0, 50) || null,
      soulMd: soulMd?.substring(0, 50) || null,
      timezone,
      leadNickname,
      leadAvatarUrl,
      agentsMdLength: agentsMd?.length || 0,
      soulMdLength: soulMd?.length || 0,
    })
    set({ isLoading: true });
    try {
      await api.put('/lead/preferences', {
        agentsMd,
        soulMd,
        timezone,
        leadNickname,
        leadAvatarUrl,
        glassEffect,
        backgroundImage,
        autoArchiveDays,
      });
      set({
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[LeadPreferencesStore] Failed to save lead preferences:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setAgentsMd: (content) => {
    console.log('[LeadPreferencesStore] setAgentsMd:', {
      contentLength: content.length,
      contentPreview: content.substring(0, 50),
    })
    set({
      agentsMd: content,
      isCustomized: true,
    });
  },

  setSoulMd: (content) => {
    console.log('[LeadPreferencesStore] setSoulMd:', {
      contentLength: content.length,
      contentPreview: content.substring(0, 50),
    })
    set({
      soulMd: content,
      isCustomized: true,
    });
  },

  setTimezone: (tz) => {
    set({ timezone: tz });
  },

  setLeadNickname: (name) => {
    set({ leadNickname: name, isCustomized: true });
  },

  setLeadAvatarUrl: (url) => {
    set({ leadAvatarUrl: url, isCustomized: true });
  },

  setGlassEffect: (value) => {
    set({ glassEffect: value });
  },

  setBackgroundImage: (value) => {
    set({ backgroundImage: value });
  },

  setAutoArchiveDays: (days) => {
    set({ autoArchiveDays: days });
  },

  resetToDefaults: () => {
    set({
      agentsMd: DEFAULT_LEAD_AGENTS_MD,
      soulMd: DEFAULT_LEAD_SOUL_MD,
      glassEffect: false,
      backgroundImage: null,
      isCustomized: false,
    });
  },

  getDisplayAgentsMd: () => {
    return get().agentsMd || DEFAULT_LEAD_AGENTS_MD;
  },

  getDisplaySoulMd: () => {
    return get().soulMd || DEFAULT_LEAD_SOUL_MD;
  },
}));
