/**
 * The budget decision for one request (rules 3 to 6 of the spec): company pool first, then the
 * employee's daily allowance, then their overflow policy. Pure: it reads only its input.
 */

import { effectiveLimits } from "./limits.ts";
import { nextDayStart, nextWeekStart } from "./periods.ts";
import { companySpendThisWeek, personalSpendToday, poolDrawsThisWeek } from "./spend.ts";
import type { Company, Decision, Employee, Tier, UsageRecord } from "./types.ts";

/** Everything the budget rules need for one request. */
export type DecisionInput = {
  company: Company;
  tier: Tier;
  employee: Employee;
  /** The company's usage records, at least since the start of the current week. */
  usage: readonly UsageRecord[];
  now: Date;
};

/** Allows the request from a bucket, or blocks it with the reason, amounts and reset time. */
export function decide(input: DecisionInput): Decision {
  const { company, tier, employee, usage, now } = input;

  const companySpend = companySpendThisWeek(usage, company.id, now);
  if (companySpend >= company.weeklyPoolMicros) {
    return {
      kind: "block",
      reason: "company_pool_exhausted",
      spentMicros: companySpend,
      limitMicros: company.weeklyPoolMicros,
      resetsAt: nextWeekStart(now),
    };
  }

  const limits = effectiveLimits(tier, employee.overrides, company.weeklyPoolMicros);
  const personalSpend = personalSpendToday(usage, employee.id, now);
  if (personalSpend < limits.dailyAllowanceMicros) {
    return { kind: "allow", bucket: "personal" };
  }

  if (limits.overflow.kind === "block") {
    return {
      kind: "block",
      reason: "personal_allowance_exhausted",
      spentMicros: personalSpend,
      limitMicros: limits.dailyAllowanceMicros,
      resetsAt: nextDayStart(now),
    };
  }

  const poolCap = limits.overflow.weeklyCapMicros;
  const poolDraws = poolDrawsThisWeek(usage, employee.id, now);
  if (poolCap === null || poolDraws < poolCap) {
    return { kind: "allow", bucket: "pool" };
  }

  return {
    kind: "block",
    reason: "pool_cap_reached",
    spentMicros: poolDraws,
    limitMicros: poolCap,
    // With an allowance, tomorrow's fresh allowance unblocks them. With none, only the weekly
    // pool-cap reset does.
    resetsAt: limits.dailyAllowanceMicros > 0 ? nextDayStart(now) : nextWeekStart(now),
  };
}
