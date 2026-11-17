/**
 * UTC day and week boundaries for budget periods. A day is [00:00 UTC, next 00:00 UTC) and a
 * week starts Monday 00:00 UTC. An instant exactly on a boundary belongs to the new period.
 */

/** 00:00 UTC on the day containing `at`. */
export function dayStart(at: Date): Date {
  throw new Error("not implemented");
}

/** 00:00 UTC on the day after the one containing `at`. */
export function nextDayStart(at: Date): Date {
  throw new Error("not implemented");
}

/** Monday 00:00 UTC of the week containing `at`. */
export function weekStart(at: Date): Date {
  throw new Error("not implemented");
}

/** Monday 00:00 UTC of the week after the one containing `at`. */
export function nextWeekStart(at: Date): Date {
  throw new Error("not implemented");
}
