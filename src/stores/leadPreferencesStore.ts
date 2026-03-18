'use client';

import { create } from 'zustand';
import { api } from '@/lib/api/client';

const DEFAULT_AGENTS_MD = `# 团队成员配置指南

## 角色定义
- **Researcher（研究员）**: 负责信息收集、资料整理、背景调查
- **Writer（撰稿人）**: 负责文档撰写、内容创作、编辑润色
- **Analyst（分析师）**: 负责数据分析、逻辑推理、问题诊断
- **Engineer（工程师）**: 负责技术开发、代码实现、系统集成
- **Coordinator（协调员）**: 负责流程管理、资源协调、进度跟踪

## 协作原则
1. 每个团队成员专注于自己的专业领域
2. 复杂任务应拆解并分配给多个角色
3. 定期汇报进度，及时同步问题
4. 尊重彼此的专业判断`;

const DEFAULT_SOUL_MD = `# Team Lead 核心理念

## 我的身份
我是 Swarm 团队的 Team Lead，我的职责是：
- 规划任务并拆解为可执行的子任务
- 为每个子任务创建专门的角色
- 协调团队成员的工作进度
- 确保任务按时高质量完成

## 我的工作方式
1. **绝不亲自执行具体工作** - 所有实质性工作都由队友完成
2. **精简高效** - 回复用户时简洁明了，不重复队友的工作成果
3. **主动规划** - 收到任务后立即创建 Todo 并开始分解
4. **结果导向** - 关注交付物而非过程，确保用户需求得到满足

## 沟通风格
- 专业但不刻板
- 清晰但不冗长
- 关注解决方案而非问题本身`;

interface LeadPreferencesState {
  agentsMd: string | null;
  soulMd: string | null;
  isCustomized: boolean;
  isLoading: boolean;
  lastUpdated: string | null;
  loadPreferences: () => Promise<void>;
  savePreferences: () => Promise<void>;
  setAgentsMd: (content: string) => void;
  setSoulMd: (content: string) => void;
  resetToDefaults: () => void;
  // 用于 UI 显示的默认值
  getDisplayAgentsMd: () => string;
  getDisplaySoulMd: () => string;
}

export const useLeadPreferencesStore = create<LeadPreferencesState>()((set, get) => ({
  agentsMd: null,
  soulMd: null,
  isCustomized: false,
  isLoading: false,
  lastUpdated: null,

  loadPreferences: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<{ agentsMd: string | null; soulMd: string | null }>('/lead/preferences');
      const hasCustomAgents = response.agentsMd && response.agentsMd.trim().length > 0;
      const hasCustomSoul = response.soulMd && response.soulMd.trim().length > 0;

      console.log('[LeadPreferencesStore] 加载配置:', {
        agentsMd: response.agentsMd?.substring(0, 50),
        soulMd: response.soulMd?.substring(0, 50),
        hasCustomAgents,
        hasCustomSoul,
      })

      set({
        agentsMd: response.agentsMd,
        soulMd: response.soulMd,
        isCustomized: hasCustomAgents || hasCustomSoul,
        isLoading: false,
      });
    } catch (error) {
      console.error('[LeadPreferencesStore] Failed to load lead preferences:', error);
      set({ isLoading: false });
    }
  },

  savePreferences: async () => {
    const { agentsMd, soulMd } = get();
    console.log('[LeadPreferencesStore] 保存配置:', {
      agentsMd: agentsMd?.substring(0, 50) || null,
      soulMd: soulMd?.substring(0, 50) || null,
      agentsMdLength: agentsMd?.length || 0,
      soulMdLength: soulMd?.length || 0,
    })
    set({ isLoading: true });
    try {
      await api.put('/lead/preferences', {
        agentsMd,
        soulMd,
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

  resetToDefaults: () => {
    set({
      agentsMd: null,
      soulMd: null,
      isCustomized: false,
    });
  },

  getDisplayAgentsMd: () => {
    return get().agentsMd || DEFAULT_AGENTS_MD;
  },

  getDisplaySoulMd: () => {
    return get().soulMd || DEFAULT_SOUL_MD;
  },
}));
