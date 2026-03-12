import { format, isToday, isYesterday, isSameWeek, isSameYear } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 格式化消息时间
 */
export function formatMessageTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm');
}

/**
 * 格式化消息日期分组
 */
export function formatMessageGroup(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d)) {
    return '今天';
  }
  if (isYesterday(d)) {
    return '昨天';
  }
  if (isSameWeek(d, new Date(), { weekStartsOn: 1 })) {
    return format(d, 'EEEE', { locale: zhCN });
  }
  if (isSameYear(d, new Date())) {
    return format(d, 'M月d日', { locale: zhCN });
  }
  return format(d, 'yyyy年M月d日', { locale: zhCN });
}

/**
 * 格式化会话列表时间
 */
export function formatSessionTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d)) {
    return format(d, 'HH:mm');
  }
  if (isYesterday(d)) {
    return '昨天';
  }
  if (isSameWeek(d, new Date(), { weekStartsOn: 1 })) {
    return format(d, 'EEEE', { locale: zhCN });
  }
  if (isSameYear(d, new Date())) {
    return format(d, 'M/d');
  }
  return format(d, 'yyyy/M/d');
}
