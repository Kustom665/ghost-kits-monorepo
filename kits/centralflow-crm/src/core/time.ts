/**
 * Time arithmetic for response clocks.
 *
 * Everything an agency promises a client is measured in *business* hours. A
 * message that lands at 6pm Friday and is answered at 9:30am Monday was
 * answered in half an hour of working time, not sixty-three hours. Wall-clock
 * SLA dashboards produce exactly one behaviour — people stop trusting them —
 * so the clock here only runs during the workweek.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export interface WorkWeek {
  /** Local hour the day opens, e.g. 9 for 9am. */
  startHour: number;
  /** Local hour the day closes, exclusive. */
  endHour: number;
  /** Working days, 0 = Sunday. */
  days: number[];
  /**
   * Minutes to add to UTC to get the agency's local time.
   * -300 is US Eastern in daylight time.
   */
  tzOffsetMinutes: number;
}

export const DEFAULT_WORK_WEEK: WorkWeek = {
  startHour: 9,
  endHour: 18,
  days: [1, 2, 3, 4, 5],
  tzOffsetMinutes: -300,
};

export function toMs(iso: string): number {
  return new Date(iso).getTime();
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function hoursBetween(fromIso: string, toIso_: string): number {
  return (toMs(toIso_) - toMs(fromIso)) / MS_PER_HOUR;
}

export function daysBetween(fromIso: string, toIso_: string): number {
  return (toMs(toIso_) - toMs(fromIso)) / MS_PER_DAY;
}

export function addDays(iso: string, days: number): string {
  return toIso(toMs(iso) + days * MS_PER_DAY);
}

export function addHours(iso: string, hours: number): string {
  return toIso(toMs(iso) + hours * MS_PER_HOUR);
}

/** Whole days elapsed, floored at zero — for "quiet for N days" copy. */
export function daysAgo(fromIso: string, nowIso: string): number {
  return Math.max(0, Math.floor(daysBetween(fromIso, nowIso)));
}

/** Shift a UTC instant into the agency's local frame so day maths is trivial. */
function localMs(utcMs: number, week: WorkWeek): number {
  return utcMs + week.tzOffsetMinutes * MS_PER_MINUTE;
}

function dayStartMs(local: number): number {
  return Math.floor(local / MS_PER_DAY) * MS_PER_DAY;
}

function isWorkingDay(dayStart: number, week: WorkWeek): boolean {
  return week.days.includes(new Date(dayStart).getUTCDay());
}

/**
 * Working milliseconds between two instants. Walks day by day and intersects
 * each open window with the interval — clear to read and, more importantly,
 * clear to check against a hand-worked example in a test.
 */
export function businessMsBetween(
  fromIso: string,
  toIso_: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): number {
  const from = localMs(toMs(fromIso), week);
  const to = localMs(toMs(toIso_), week);
  if (!(to > from)) return 0;

  const openOffset = week.startHour * MS_PER_HOUR;
  const closeOffset = week.endHour * MS_PER_HOUR;
  if (closeOffset <= openOffset) return 0;

  let total = 0;
  for (let day = dayStartMs(from); day <= to; day += MS_PER_DAY) {
    if (!isWorkingDay(day, week)) continue;
    const open = Math.max(day + openOffset, from);
    const close = Math.min(day + closeOffset, to);
    if (close > open) total += close - open;
  }
  return total;
}

export function businessHoursBetween(
  fromIso: string,
  toIso_: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): number {
  return businessMsBetween(fromIso, toIso_, week) / MS_PER_HOUR;
}

/** Business hours ÷ hours in a working day, for "2.5 working days" copy. */
export function businessDaysBetween(
  fromIso: string,
  toIso_: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): number {
  const perDay = week.endHour - week.startHour;
  return perDay > 0 ? businessHoursBetween(fromIso, toIso_, week) / perDay : 0;
}

/**
 * The instant that is `hours` of working time after `fromIso` — the deadline a
 * response SLA actually resolves to. An hour before close plus a four-hour
 * budget lands mid-morning tomorrow, which is what a client experiences.
 */
export function addBusinessHours(
  fromIso: string,
  hours: number,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): string {
  const openOffset = week.startHour * MS_PER_HOUR;
  const closeOffset = week.endHour * MS_PER_HOUR;
  const perDay = closeOffset - openOffset;
  if (perDay <= 0) return fromIso;

  let remaining = Math.max(0, hours) * MS_PER_HOUR;
  let cursor = localMs(toMs(fromIso), week);

  // A full working year of days is a generous ceiling; it only exists so a
  // pathological input cannot spin forever.
  for (let guard = 0; guard < 500; guard += 1) {
    const day = dayStartMs(cursor);
    if (isWorkingDay(day, week)) {
      const open = day + openOffset;
      const close = day + closeOffset;
      const start = Math.max(cursor, open);
      if (start < close) {
        const available = close - start;
        if (remaining <= available) {
          return toIso(start + remaining - week.tzOffsetMinutes * MS_PER_MINUTE);
        }
        remaining -= available;
      }
    }
    cursor = day + MS_PER_DAY + openOffset;
  }
  return toIso(cursor - week.tzOffsetMinutes * MS_PER_MINUTE);
}

/**
 * The mirror of {@link addBusinessHours}: the instant that is `hours` of
 * working time *before* `fromIso`. Used to answer "what was true four working
 * hours ago" without pretending the night shift exists.
 */
export function subtractBusinessHours(
  fromIso: string,
  hours: number,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): string {
  const openOffset = week.startHour * MS_PER_HOUR;
  const closeOffset = week.endHour * MS_PER_HOUR;
  if (closeOffset <= openOffset) return fromIso;

  let remaining = Math.max(0, hours) * MS_PER_HOUR;
  let cursor = localMs(toMs(fromIso), week);

  for (let guard = 0; guard < 500; guard += 1) {
    const day = dayStartMs(cursor);
    if (isWorkingDay(day, week)) {
      const open = day + openOffset;
      const end = Math.min(cursor, day + closeOffset);
      if (end > open) {
        const available = end - open;
        if (remaining <= available) {
          return toIso(end - remaining - week.tzOffsetMinutes * MS_PER_MINUTE);
        }
        remaining -= available;
      }
    }
    cursor = day - MS_PER_DAY + closeOffset;
  }
  return toIso(cursor - week.tzOffsetMinutes * MS_PER_MINUTE);
}

/** Snap an instant forward to the next moment the agency is actually open. */
export function nextBusinessInstant(iso: string, week: WorkWeek = DEFAULT_WORK_WEEK): string {
  return addBusinessHours(iso, 0, week);
}

export function isWithinBusinessHours(
  iso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): boolean {
  const local = localMs(toMs(iso), week);
  const day = dayStartMs(local);
  if (!isWorkingDay(day, week)) return false;
  const offset = local - day;
  return offset >= week.startHour * MS_PER_HOUR && offset < week.endHour * MS_PER_HOUR;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Nearest-rank percentile. Response times and deal dwell times are both heavily
 * right-skewed, so the mean describes a client nobody has.
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
