/**
 * Agent 时间格式化工具
 * 
 * 为 Agent system prompt 提供时间戳，支持用户自定义时区。
 * 优先级: 用户偏好时区 > 服务器本地时区
 */

import prisma from '@/lib/db'

const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * 获取用户配置的时区，如果未设置则返回服务器本地时区
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })
    return user?.timezone || serverTimezone
  } catch {
    return serverTimezone
  }
}

/**
 * 格式化日期到指定时区的可读字符串
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ` (${timezone})`
}

/**
 * 构建系统提示中的时间信息段落
 */
export function buildTimeInfoSection(createdAt: Date, timezone: string): string {
  const createdStr = formatDateInTimezone(createdAt, timezone)
  const nowStr = formatDateInTimezone(new Date(), timezone)
  return `\n\n## 系统时间信息\n- 代理创建时间: ${createdStr}\n- 当前系统时间: ${nowStr}`
}

export { serverTimezone }
