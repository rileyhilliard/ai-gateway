/**
 * Formats the report's instants and durations for the header: the reset time, the countdown to
 * it, and how fresh the data is. Budget periods are UTC, so every clock time here is too.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const weekdayAndTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const clockTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** An instant as a weekday and time in UTC: "Mon 00:00 UTC". */
export function formatResetTime(at: string): string {
  return `${weekdayAndTime.format(new Date(at)).replace(",", "")} UTC`;
}

/** An instant as a clock time in UTC: "14:02:10 UTC". */
export function formatClockTime(at: Date | number): string {
  return `${clockTime.format(at)} UTC`;
}

/**
 * The time from `from` until `to` in its two largest units: "2d 3h", "3h 12m", "45m", or "<1m"
 * when under a minute (or already past).
 */
export function formatCountdown(from: string, to: string): string {
  const remaining = Date.parse(to) - Date.parse(from);
  if (remaining < MINUTE_MS) return "<1m";
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** How long ago `updatedAt` was, as of `now`: "2 s ago", or "3 min ago" past a minute. */
export function formatAge(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}
