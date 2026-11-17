/**
 * The usage view: for every employee, today's personal spend against their allowance, this
 * week's pool draws against their cap, and this week's blocked requests, plus company spend
 * against the weekly pool. Pure: it reads only its input, and reuses the budget module's sums
 * and limits so the view always agrees with the decisions the gateway made.
 */

import { effectiveLimits } from "../budget/limits.ts";
import { nextDayStart, nextWeekStart } from "../budget/periods.ts";
import {
  blockedRequestsThisWeek,
  companySpendThisWeek,
  personalSpendToday,
  poolDrawsThisWeek,
} from "../budget/spend.ts";
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
  const { company, employees, usage, now } = input;
  return {
    asOf: now,
    dayResetsAt: nextDayStart(now),
    weekResetsAt: nextWeekStart(now),
    company: {
      id: company.id,
      name: company.name,
      spentThisWeekMicros: companySpendThisWeek(usage, company.id, now),
      weeklyPoolMicros: company.weeklyPoolMicros,
    },
    employees: employees.map((employee) => employeeUsage(employee, input)),
  };
}

/**
 * One employee's row, with limits resolved from their tier and overrides.
 *
 * @throws {Error} When the employee's tier isn't in `tiers`.
 */
function employeeUsage(employee: Employee, input: UsageReportInput): EmployeeUsage {
  const { company, tiers, usage, now } = input;
  const tier = tierOf(employee, tiers);
  const limits = effectiveLimits(tier, employee.overrides, company.weeklyPoolMicros);
  return {
    employeeId: employee.id,
    name: employee.name,
    tierId: employee.tierId,
    disabled: employee.disabled,
    spentTodayMicros: personalSpendToday(usage, employee.id, now),
    dailyAllowanceMicros: limits.dailyAllowanceMicros,
    overflow: limits.overflow,
    poolDrawsThisWeekMicros: poolDrawsThisWeek(usage, employee.id, now),
    blockedThisWeek: blockedRequestsThisWeek(usage, employee.id, now),
  };
}

/**
 * The tier the employee belongs to.
 *
 * @throws {Error} When the tier isn't in `tiers`.
 */
function tierOf(employee: Employee, tiers: readonly Tier[]): Tier {
  const tier = tiers.find((candidate) => candidate.id === employee.tierId);
  if (tier) return tier;
  throw new Error(
    `Employee "${employee.id}" belongs to tier "${employee.tierId}", which doesn't exist. Add the tier to the seed or fix the employee's tierId.`,
  );
}
