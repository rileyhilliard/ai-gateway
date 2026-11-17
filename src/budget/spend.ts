/**
 * The three spend sums the budget rules compare against limits. Only allowed records count;
 * blocked records have zero cost and never add to a sum.
 */

import type { Micros, UsageRecord } from "./types.ts";

/** Everything the company spent this week, from either bucket. */
export function companySpendThisWeek(
  records: readonly UsageRecord[],
  companyId: string,
  now: Date,
): Micros {
  throw new Error("not implemented");
}

/** What one employee charged to their personal allowance today. */
export function personalSpendToday(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  throw new Error("not implemented");
}

/** What one employee drew from the company pool this week. */
export function poolDrawsThisWeek(
  records: readonly UsageRecord[],
  employeeId: string,
  now: Date,
): Micros {
  throw new Error("not implemented");
}
