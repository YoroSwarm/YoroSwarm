/**
 * 记忆系统配置常量
 */

export const MEMORY_CONFIG = {
  // 记忆重要性等级
  importance: {
    VERY_LOW: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
    CRITICAL: 5,
  },

  // 记忆类型
  memoryTypes: {
    PERSONAL: 'PERSONAL',
    DREAM: 'DREAM',
    EXPERIENCE: 'EXPERIENCE',
    FACT: 'FACT',
    PREFERENCE: 'PREFERENCE',
  },

  // Dream 相关配置
  dream: {
    // 默认 mood 值
    moods: ['peaceful', 'anxious', 'excited', 'confused', 'joyful', 'sad', 'scared', 'neutral'],
    // 默认 emotion 值
    emotions: ['joy', 'fear', 'wonder', 'sadness', 'anger', 'disgust', 'surprise', 'anticipation'],
  },

  // 记忆检索配置
  retrieval: {
    defaultLimit: 20,
    maxLimit: 100,
    // 检索时考虑的时间范围（天数）
    relevanceWindowDays: 30,
  },
} as const

export type MemoryImportance = (typeof MEMORY_CONFIG.importance)[keyof typeof MEMORY_CONFIG.importance]
export type MemoryType = (typeof MEMORY_CONFIG.memoryTypes)[keyof typeof MEMORY_CONFIG.memoryTypes]
