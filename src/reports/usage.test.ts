/**
 * The usage view's numbers: each employee's spend today against their allowance, pool draws
 * this week against their cap, blocked requests this week, and company spend against the pool.
 * It must agree with the budget rules, so overrides and period boundaries apply the same way.
 */

import { describe, expect, it } from "vitest";
import {
  makeCompany,
  makeEmployee,
  makeRecord,
  makeTier,
  NOW,
  usd,
} from "../../tests/helpers/fixtures.ts";
import type { Employee, UsageRecord } from "../budget/types.ts";
import { usageReport } from "./usage.ts";

const LAST_SUNDAY = new Date("2026-11-15T23:00:00.000Z");
const YESTERDAY = new Date("2026-11-17T12:00:00.000Z");

const engineer = makeTier();
const intern = makeTier({
  id: "intern",
  dailyAllowance: { kind: "fixed", micros: usd(0.1) },
  overflow: { kind: "block" },
});
const ada = makeEmployee();
const bob = makeEmployee({ id: "bob", name: "Bob", tierId: "intern", apiKey: "key-bob" });

function reportFor(usage: UsageRecord[], employees: Employee[] = [ada, bob]) {
  return usageReport({
    company: makeCompany(),
    tiers: [engineer, intern],
    employees,
    usage,
    now: NOW,
  });
}

describe("company totals", () => {
  it("adds every allowed request since Monday against the weekly pool", () => {
    const report = reportFor([
      makeRecord({ costMicros: usd(1), bucket: "personal" }),
      makeRecord({ costMicros: usd(2), bucket: "pool", startedAt: YESTERDAY }),
      makeRecord({ costMicros: usd(5), startedAt: LAST_SUNDAY }),
    ]);
    expect(report.company).toEqual({
      id: "acme",
      name: "Acme",
      spentThisWeekMicros: usd(3),
      weeklyPoolMicros: usd(10),
    });
  });

  it("says when the day and the week reset", () => {
    const report = reportFor([]);
    expect(report.asOf).toEqual(NOW);
    expect(report.dayResetsAt).toEqual(new Date("2026-11-19T00:00:00.000Z"));
    expect(report.weekResetsAt).toEqual(new Date("2026-11-23T00:00:00.000Z"));
  });
});

describe("employee rows", () => {
  it("lists every employee in order, including ones with no usage and disabled ones", () => {
    const dee = makeEmployee({ id: "dee", name: "Dee", apiKey: "key-dee", disabled: true });
    const report = reportFor([], [bob, ada, dee]);
    expect(report.employees.map((row) => [row.employeeId, row.disabled])).toEqual([
      ["bob", false],
      ["ada", false],
      ["dee", true],
    ]);
    expect(report.employees[1]).toEqual({
      employeeId: "ada",
      name: "Ada",
      tierId: "engineer",
      disabled: false,
      spentTodayMicros: 0,
      dailyAllowanceMicros: usd(0.5),
      overflow: { kind: "pool", weeklyCapMicros: usd(2) },
      poolDrawsThisWeekMicros: 0,
      spentThisWeekMicros: 0,
      blockedThisWeek: 0,
    });
  });

  it("shows today's personal spend and this week's pool draws, each in its own period", () => {
    const report = reportFor([
      makeRecord({ costMicros: usd(0.3), bucket: "personal" }),
      makeRecord({ costMicros: usd(0.4), bucket: "personal", startedAt: YESTERDAY }),
      makeRecord({ costMicros: usd(0.7), bucket: "pool", startedAt: YESTERDAY }),
      makeRecord({ costMicros: usd(0.2), bucket: "pool" }),
      makeRecord({ costMicros: usd(9), bucket: "pool", startedAt: LAST_SUNDAY }),
    ]);
    expect(report.employees[0]).toMatchObject({
      spentTodayMicros: usd(0.3),
      poolDrawsThisWeekMicros: usd(0.9),
    });
  });

  it("totals each employee's spend this week from both buckets, for what they cost", () => {
    const report = reportFor([
      makeRecord({ costMicros: usd(0.4), bucket: "personal", startedAt: YESTERDAY }),
      makeRecord({ costMicros: usd(0.3), bucket: "personal" }),
      makeRecord({ costMicros: usd(0.7), bucket: "pool" }),
      makeRecord({ costMicros: usd(9), bucket: "pool", startedAt: LAST_SUNDAY }),
      makeRecord({ employeeId: "bob", costMicros: usd(0.1), bucket: "personal" }),
    ]);
    expect(report.employees.map((row) => row.spentThisWeekMicros)).toEqual([usd(1.4), usd(0.1)]);
  });

  it("counts this week's blocked requests per employee, not last week's", () => {
    const blocked = (employeeId: string, startedAt = NOW) =>
      makeRecord({
        employeeId,
        status: "blocked",
        bucket: null,
        blockReason: "personal_allowance_exhausted",
        startedAt,
      });
    const report = reportFor([
      blocked("bob"),
      blocked("bob", YESTERDAY),
      blocked("bob", LAST_SUNDAY),
    ]);
    expect(report.employees.map((row) => row.blockedThisWeek)).toEqual([0, 2]);
  });

  it("shows limits with the employee's overrides applied", () => {
    const overridden = makeEmployee({
      overrides: { dailyAllowanceMicros: usd(1), poolCapMicros: null },
    });
    const [row] = reportFor([], [overridden]).employees;
    expect(row).toMatchObject({
      dailyAllowanceMicros: usd(1),
      overflow: { kind: "pool", weeklyCapMicros: null },
    });
  });

  it("shows a block tier's policy with no pool cap", () => {
    expect(reportFor([]).employees[1]?.overflow).toEqual({ kind: "block" });
  });

  it("throws when an employee's tier is missing", () => {
    const lost = makeEmployee({ tierId: "ghost" });
    expect(() => reportFor([], [lost])).toThrow(/ghost/);
  });
});

describe("project rows", () => {
  const tagged = (projectTag: string | null, dollars: number, startedAt = NOW) =>
    makeRecord({ projectTag, costMicros: usd(dollars), startedAt });
  const blockedFor = (projectTag: string | null) =>
    makeRecord({
      projectTag,
      status: "blocked",
      bucket: null,
      blockReason: "personal_allowance_exhausted",
    });

  it("sums this week's allowed spend per project, with untagged spend under null", () => {
    const report = reportFor([
      tagged("apollo", 1),
      tagged("apollo", 0.5, YESTERDAY),
      makeRecord({ projectTag: "apollo", bucket: "pool", costMicros: usd(0.25) }),
      tagged(null, 0.2),
      tagged("zeus", 2),
    ]);
    expect(report.projects).toEqual([
      { projectTag: "zeus", spentThisWeekMicros: usd(2), requests: 1, blockedRequests: 0 },
      { projectTag: "apollo", spentThisWeekMicros: usd(1.75), requests: 3, blockedRequests: 0 },
      { projectTag: null, spentThisWeekMicros: usd(0.2), requests: 1, blockedRequests: 0 },
    ]);
  });

  it("counts blocked requests per project without adding to spend", () => {
    const report = reportFor([
      tagged("apollo", 1),
      blockedFor("apollo"),
      blockedFor("apollo"),
      blockedFor(null),
    ]);
    expect(report.projects).toEqual([
      { projectTag: "apollo", spentThisWeekMicros: usd(1), requests: 1, blockedRequests: 2 },
      { projectTag: null, spentThisWeekMicros: 0, requests: 0, blockedRequests: 1 },
    ]);
  });

  it("leaves out records from before this week", () => {
    const report = reportFor([tagged("apollo", 1), tagged("old", 5, LAST_SUNDAY)]);
    expect(report.projects.map((row) => row.projectTag)).toEqual(["apollo"]);
  });

  it("sorts projects by spend, highest first, with untagged last on ties", () => {
    const report = reportFor([
      tagged(null, 1),
      tagged("beta", 1),
      tagged("small", 0.1),
      tagged("alpha", 1),
      tagged("big", 3),
    ]);
    expect(report.projects.map((row) => row.projectTag)).toEqual([
      "big",
      "alpha",
      "beta",
      null,
      "small",
    ]);
  });

  it("returns an empty list for a week with no usage", () => {
    expect(reportFor([tagged("old", 5, LAST_SUNDAY)]).projects).toEqual([]);
  });
});
