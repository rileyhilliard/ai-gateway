/**
 * The usage view: for every employee, today's personal spend against their allowance, this
 * week's pool draws against their cap, and this week's blocked requests, plus company spend
 * against the weekly pool. Pure: it reads only its input, and reuses the budget module's sums
 * and limits so the view always agrees with the decisions the gateway made.
 */

import type {
  Company,
  Employee,
  Micros,
  OverflowPolicy,
  Tier,
  UsageRecord,
} from "../budget/types.ts";

/** One employee's line in the usage view, with overrides already applied to the limits. */
export type EmployeeUsage = {
  employeeId: string;
  name: string;
  tierId: string;
  disabled: boolean;
  spentTodayMicros: Micros;
  dailyAllowanceMicros: Micros;
  /** The effective policy after the allowance; a pool cap of null means uncapped. */
  overflow: OverflowPolicy;
  poolDrawsThisWeekMicros: Micros;
  blockedThisWeek: number;
};

/** The whole usage view at one instant. */
export type UsageReport = {
  asOf: Date;
  /** When today's allowances refill (next 00:00 UTC). */
  dayResetsAt: Date;
  /** When the pool and pool caps reset (next Monday 00:00 UTC). */
  weekResetsAt: Date;
  company: {
    id: string;
    name: string;
    spentThisWeekMicros: Micros;
    weeklyPoolMicros: Micros;
  };
  /** One row per employee, disabled ones included, in the order given. */
  employees: EmployeeUsage[];
};

/** Everything the usage view is computed from. */
export type UsageReportInput = {
  company: Company;
  tiers: readonly Tier[];
  employees: readonly Employee[];
  /** The company's usage records, at least since the start of the current week. */
  usage: readonly UsageRecord[];
  now: Date;
};

/**
 * Builds the usage view.
 *
 * @throws {Error} When an employee's tier isn't in `tiers`, which is a seed or programming error.
 */
export function usageReport(input: UsageReportInput): UsageReport {
  throw new Error("not implemented");
}
