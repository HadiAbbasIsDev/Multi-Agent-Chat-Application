// utils/formatTime.ts
import { format, isToday, isYesterday } from 'date-fns';

export const formatTime = (ts: number, short = false): string => {
  const date = new Date(ts);
  if (short) return format(date, 'HH:mm');
  if (isToday(date)) return format(date, "'Today' HH:mm");
  if (isYesterday(date)) return format(date, "'Yesterday' HH:mm");
  return format(date, 'dd MMM HH:mm');
};

export const groupByDate = (messages: Message[]): [string, Message[]][] => {
  const map: Record<string, Message[]> = {};
  messages.forEach((m) => {
    const d = new Date(m.createdAt);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'dd MMM yyyy');
    (map[key] ??= []).push(m);
  });
  return Object.entries(map);
};