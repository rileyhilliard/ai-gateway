/**
 * UTC day and week boundaries for budget periods. A day is [00:00 UTC, next 00:00 UTC) and a
 * week starts Monday 00:00 UTC. An instant exactly on a boundary belongs to the new period.
 */

const DAYS_PER_WEEK = 7;

/** 00:00 UTC on the day containing `at`. */
export function dayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** 00:00 UTC on the day after the one containing `at`. */
export function nextDayStart(at: Date): Date {
  return addUtcDays(dayStart(at), 1);
}

/** Monday 00:00 UTC of the week containing `at`. */
export function weekStart(at: Date): Date {
  // getUTCDay counts from Sunday (0); shifting by 6 makes Monday 0 and Sunday 6.
  const daysSinceMonday = (at.getUTCDay() + 6) % DAYS_PER_WEEK;
  return addUtcDays(dayStart(at), -daysSinceMonday);
}

/** Monday 00:00 UTC of the week after the one containing `at`. */
export function nextWeekStart(at: Date): Date {
  return addUtcDays(weekStart(at), DAYS_PER_WEEK);
}

/** A half-open time window: `start` is inside it, `end` is not. */
export type Period = { start: Date; end: Date };

/** The UTC day containing `now`. */
export function today(now: Date): Period {
  return { start: dayStart(now), end: nextDayStart(now) };
}

/** The Monday-to-Monday UTC week containing `now`. */
export function thisWeek(now: Date): Period {
  return { start: weekStart(now), end: nextWeekStart(now) };
}

/**
 * Whether `at` falls inside `period`. The end bound matters when the clock is set back: an
 * instant after now belongs to a later period.
 */
export function isWithin(at: Date, period: Period): boolean {
  return at >= period.start && at < period.end;
}

/** The UTC midnight `days` calendar days from `midnight`. Date.UTC rolls over months and years. */
function addUtcDays(midnight: Date, days: number): Date {
  return new Date(
    Date.UTC(midnight.getUTCFullYear(), midnight.getUTCMonth(), midnight.getUTCDate() + days),
  );
}
