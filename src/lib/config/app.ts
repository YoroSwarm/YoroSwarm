/**
 * 应用配置
 * 从环境变量读取应用名称等配置
 */

export const appConfig = {
  // 应用名称，默认为 Swarm
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Swarm',

  // 应用标语
  tagline: '合千心为一智',

  // 完整标题
  get title() {
    return `${this.name} - ${this.tagline}`;
  },

  // 应用描述
  description: '通用办公助手Agent集群系统，支持信息搜集、文档撰写、代码编程、多文件处理等',
} as const;
