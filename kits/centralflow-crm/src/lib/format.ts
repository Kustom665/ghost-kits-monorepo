import { DEFAULT_WORK_WEEK, MS_PER_HOUR, MS_PER_MINUTE } from '#core';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A stable hue per entity so the same person keeps the same avatar colour
 * across every screen. Restricted to the violet-through-magenta arc the rest of
 * the interface lives in, plus a cool blue, so avatars read as a set.
 */
export function avatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = 250 + (hash % 90); // 250-340: violet → magenta
  const second = 200 + (hash % 60);
  return `linear-gradient(135deg, hsl(${hue} 72% 58%), hsl(${second} 68% 46%))`;
}

/** Wall-clock relative time, for "when did this land" copy. */
export function timeAgo(iso: string, nowIso: string): string {
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

/** Working hours, phrased the way someone would say it out loud. */
export function workingHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 10) return `${Math.round(hours * 10) / 10}h`;
  if (hours < 18) return `${Math.round(hours)}h`;
  const days = hours / 9;
  return `${Math.round(days * 10) / 10} working days`;
}

export function money(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Every timestamp is shown on the agency's own clock, not the server's.
 *
 * This matters more than it looks: the whole app argues in working hours, so a
 * message sent at 3:41pm on a Thursday must not render as 8:41pm — that single
 * inconsistency would make every "inside business hours" claim on the page look
 * wrong. Shifting by the same offset the SLA clock uses guarantees the two
 * always agree.
 */
function agencyClock(iso: string): Date {
  return new Date(new Date(iso).getTime() + DEFAULT_WORK_WEEK.tzOffsetMinutes * MS_PER_MINUTE);
}

export function shortDate(iso: string): string {
  return agencyClock(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function dateTime(iso: string): string {
  return agencyClock(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function hoursFromMs(ms: number): number {
  return ms / MS_PER_HOUR;
}
