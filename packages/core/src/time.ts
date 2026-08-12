export const MS_PER_DAY = 86_400_000;

export function toMs(iso: string): number {
  return new Date(iso).getTime();
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (toMs(toIso) - toMs(fromIso)) / MS_PER_DAY;
}

export function addDays(iso: string, days: number): string {
  return new Date(toMs(iso) + days * MS_PER_DAY).toISOString();
}

/** Whole days, floored at zero — for "this has been sitting N days" copy. */
export function daysAgo(fromIso: string, nowIso: string): number {
  return Math.max(0, Math.floor(daysBetween(fromIso, nowIso)));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Nearest-rank percentile. We use p90 rather than a mean because tax-return
 * cycle times are heavily right-skewed — the mean hides the returns that are
 * actually hurting you.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
