/**
 * The per-person rules the dashboard derives from the usage report: allowance used today,
 * whether someone is at their limit, cost order and who needs attention. Pure: the
 * components only format what these return.
 */

import type { EmployeeUsage } from "../../api/usage";
import { formatMoney } from "./money";

/** How much of today's allowance a person has used. A $0 allowance means they run on the pool. */
export type AllowanceUsed = { kind: "pool-only" } | { kind: "share"; share: number };

/** The status a person shows in the people table, if any. */
export type PersonStatus = "disabled" | "at-limit" | "none";

/** A person the executive should look at: a short reason and how often they were blocked. */
export type AttentionItem = {
  employeeId: string;
  name: string;
  reason: string;
  blockedThisWeek: number;
};

/** Today's personal spend against the daily allowance. */
export function allowanceUsed(person: EmployeeUsage): AllowanceUsed {
  if (person.dailyAllowanceMicros === 0) return { kind: "pool-only" };
  return { kind: "share", share: person.spentTodayMicros / person.dailyAllowanceMicros };
}

/**
 * Whether the gateway would block this person's next request on their own limits: a block tier
 * with today's allowance used, or a capped pool tier with both the allowance and the cap used.
 */
export function isAtLimit(person: EmployeeUsage): boolean {
  const allowanceSpent = person.spentTodayMicros >= person.dailyAllowanceMicros;
  if (person.overflow.kind === "block") return allowanceSpent;
  const cap = person.overflow.weeklyCapMicros;
  return cap !== null && allowanceSpent && person.poolDrawsThisWeekMicros >= cap;
}

/** The person's status. Disabled outranks at-limit: a disabled key can't spend at all. */
export function personStatus(person: EmployeeUsage): PersonStatus {
  if (person.disabled) return "disabled";
  return isAtLimit(person) ? "at-limit" : "none";
}

/** People ordered by what they cost this week, highest first, then by name. */
export function byCostThenName(people: readonly EmployeeUsage[]): EmployeeUsage[] {
  return [...people].sort(
    (a, b) => b.spentThisWeekMicros - a.spentThisWeekMicros || a.name.localeCompare(b.name),
  );
}

/**
 * Everyone enabled who is at their limit now or was blocked this week, most blocked first, each
 * with why. Disabled people are left out: their requests fail on the key, not the budget.
 */
export function needsAttention(people: readonly EmployeeUsage[]): AttentionItem[] {
  return people
    .filter((person) => !person.disabled && (person.blockedThisWeek > 0 || isAtLimit(person)))
    .sort((a, b) => b.blockedThisWeek - a.blockedThisWeek || a.name.localeCompare(b.name))
    .map((person) => ({
      employeeId: person.employeeId,
      name: person.name,
      reason: attentionReason(person),
      blockedThisWeek: person.blockedThisWeek,
    }));
}

/** Why someone is on the list, short enough for one line: their limit now, or what blocked them. */
function attentionReason(person: EmployeeUsage): string {
  if (person.overflow.kind === "block") {
    return isAtLimit(person)
      ? "Daily allowance used, blocked until 00:00 UTC"
      : `Ran past their ${formatMoney(person.dailyAllowanceMicros)} daily allowance`;
  }
  if (person.overflow.weeklyCapMicros === null) return "Company pool ran out";
  return isAtLimit(person)
    ? "Pool cap reached"
    : `Reached their ${formatMoney(person.overflow.weeklyCapMicros)} weekly pool cap`;
}
