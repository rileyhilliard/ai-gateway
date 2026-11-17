/**
 * The per-person rules the dashboard derives from the usage report: allowance used today,
 * whether someone is at their limit, the cost ranking and who needs attention. Pure: the
 * components only format what these return.
 */

import type { EmployeeUsage } from "../../api/usage";
import { formatMoney, ratioOf } from "./money";

/** How much of today's allowance a person has used. A $0 allowance means they run on the pool. */
export type AllowanceUsed = { kind: "pool-only" } | { kind: "share"; share: number };

/** The status chip a person gets in the people table, if any. */
export type PersonStatus = "disabled" | "at-limit" | "none";

/** One bar in the cost ranking: a person, or the people folded into "N others". */
export type RankedSpender = {
  label: string;
  spentThisWeekMicros: number;
  /** Their share of this week's company spend, from 0 to 1. */
  share: number;
};

/** A person the executive should look at, with the plain-language reasons why. */
export type AttentionItem = {
  employeeId: string;
  name: string;
  reasons: string[];
};

/** How many people the ranking shows by name before folding the rest into "N others". */
export const RANKED_BY_NAME = 8;

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

/** The person's status chip. Disabled outranks at-limit: a disabled key can't spend at all. */
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
 * The cost ranking: everyone who spent this week, highest first, the top eight by name and the
 * rest folded into one "N others" bar.
 */
export function rankSpenders(
  people: readonly EmployeeUsage[],
  companySpentMicros: number,
): RankedSpender[] {
  const spenders = byCostThenName(people.filter((person) => person.spentThisWeekMicros > 0));
  const toBar = (label: string, spent: number): RankedSpender => ({
    label,
    spentThisWeekMicros: spent,
    share: ratioOf(spent, companySpentMicros),
  });
  const named = spenders
    .slice(0, RANKED_BY_NAME)
    .map((person) => toBar(person.name, person.spentThisWeekMicros));
  const rest = spenders.slice(RANKED_BY_NAME);
  if (rest.length === 0) return named;
  const restSpent = rest.reduce((sum, person) => sum + person.spentThisWeekMicros, 0);
  return [...named, toBar(`${rest.length} ${rest.length === 1 ? "other" : "others"}`, restSpent)];
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
      reasons: attentionReasons(person),
    }));
}

function attentionReasons(person: EmployeeUsage): string[] {
  const reasons: string[] = [];
  if (person.blockedThisWeek > 0) {
    reasons.push(`${blockedTimes(person.blockedThisWeek)} this week; ${limitSentence(person)}.`);
  }
  if (isAtLimit(person)) reasons.push(atLimitSentence(person));
  return reasons;
}

function blockedTimes(count: number): string {
  return count === 1 ? "Blocked once" : `Blocked ${count} times`;
}

function limitSentence(person: EmployeeUsage): string {
  const allowance = `their daily allowance is ${formatMoney(person.dailyAllowanceMicros)}`;
  if (person.overflow.kind === "block") return allowance;
  const cap = person.overflow.weeklyCapMicros;
  if (cap === null) return "their pool draws are uncapped, so the company pool ran out";
  return `${allowance} and their weekly pool cap is ${formatMoney(cap)}`;
}

function atLimitSentence(person: EmployeeUsage): string {
  if (person.overflow.kind === "block") {
    return "At their limit now: today's allowance is used, so requests are blocked until 00:00 UTC.";
  }
  return "At their limit now: today's allowance and this week's pool cap are both used.";
}
