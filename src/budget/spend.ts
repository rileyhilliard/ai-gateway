/**
 * The spend sums the budget rules compare against limits, plus the per-employee weekly totals
 * the usage report shows. Only allowed records count toward a sum; blocked records cost nothing.
 */

import { isWithin, type Period, thisWeek, today } from "./periods.ts";
import type { Micros, UsageRecord } from "./types.ts";

/** Everything the company spent this week, from either bucket. */
export function companySpendThisWeek(
  records: readonly UsageRecord[],
  companyId: string,
  now: Date,
): Micros {
  return sumAllowedCostsIn(records, thisWeek(now), (record) => record.companyId === companyId);
}

/** What one employee charged to their personal allowance today. */
export function personalSpendToday(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  return sumAllowedCostsIn(
    records,
    today(now),
    (record) => record.employeeId === employeeId && record.bucket === "personal",
  );
}

/** What one employee drew from the company pool this week. */
export function poolDrawsThisWeek(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  return sumAllowedCostsIn(
    records,
    thisWeek(now),
    (record) => record.employeeId === employeeId && record.bucket === "pool",
  );
}

/** Everything one employee cost this week, from either bucket. */
export function employeeSpendThisWeek(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  return sumAllowedCostsIn(records, thisWeek(now), (record) => record.employeeId === employeeId);
}

/** How many of one employee's requests were blocked this week. */
export function blockedRequestsThisWeek(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): number {
  const week = thisWeek(now);
  return records.filter(
    (record) =>
      record.status === "blocked" &&
      record.employeeId === employeeId &&
      isWithin(record.startedAt, week),
  ).length;
}

/** Sums the cost of allowed records that match and started inside `period`. */
function sumAllowedCostsIn(
  records: readonly UsageRecord[],
  period: Period,
  matches: (record: UsageRecord) => boolean,
): Micros {
  let total = 0;
  for (const record of records) {
    if (record.status !== "allowed") continue;
    if (!isWithin(record.startedAt, period)) continue;
    if (!matches(record)) continue;
    total += record.costMicros;
  }
  return total;
}
