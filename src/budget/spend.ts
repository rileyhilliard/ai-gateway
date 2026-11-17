/**
 * The three spend sums the budget rules compare against limits. Only allowed records count;
 * blocked records have zero cost and never add to a sum.
 */

import { dayStart, weekStart } from "./periods.ts";
import type { Micros, UsageRecord } from "./types.ts";

/** Everything the company spent this week, from either bucket. */
export function companySpendThisWeek(
  records: readonly UsageRecord[],
  companyId: string,
  now: Date,
): Micros {
  return sumAllowedCostsSince(records, weekStart(now), (record) => record.companyId === companyId);
}

/** What one employee charged to their personal allowance today. */
export function personalSpendToday(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  return sumAllowedCostsSince(
    records,
    dayStart(now),
    (record) => record.employeeId === employeeId && record.bucket === "personal",
  );
}

/** What one employee drew from the company pool this week. */
export function poolDrawsThisWeek(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  return sumAllowedCostsSince(
    records,
    weekStart(now),
    (record) => record.employeeId === employeeId && record.bucket === "pool",
  );
}

/** Sums the cost of allowed records that match and started at or after `periodStart`. */
function sumAllowedCostsSince(
  records: readonly UsageRecord[],
  periodStart: Date,
  matches: (record: UsageRecord) => boolean,
): Micros {
  let total = 0;
  for (const record of records) {
    if (record.status !== "allowed") continue;
    if (record.startedAt.getTime() < periodStart.getTime()) continue;
    if (!matches(record)) continue;
    total += record.costMicros;
  }
  return total;
}
