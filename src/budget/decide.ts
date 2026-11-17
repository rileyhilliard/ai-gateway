/**
 * The budget decision for one request (rules 3 to 6 of the spec): company pool first, then the
 * employee's daily allowance, then their overflow policy. Pure: it reads only its input.
 */

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
  throw new Error("not implemented");
}
