/**
 * Usage reports the fake gateway serves in component tests (MSW) and browser tests (Playwright
 * routes). The numbers follow the demo seed after a run through http/gateway.http.
 */

import type { UsageReport } from "../../src/api/usage";

/**
 * Wednesday 14:02:10 UTC, 36.9% into the week: $0.0660 of a $1.00 pool spent, which projects to
 * $0.1787 by Monday. Ivy (block tier) and Eli (capped pool) are at their limits; Dee is disabled.
 */
export const usageReport: UsageReport = {
  asOf: "2026-11-18T14:02:10.000Z",
  dayResetsAt: "2026-11-19T00:00:00.000Z",
  weekResetsAt: "2026-11-23T00:00:00.000Z",
  company: {
    id: "acme",
    name: "Acme Corp",
    spentThisWeekMicros: 66_000,
    weeklyPoolMicros: 1_000_000,
  },
  employees: [
    {
      employeeId: "ivy",
      name: "Ivy",
      tierId: "intern",
      disabled: false,
      spentTodayMicros: 11_000,
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "block" },
      poolDrawsThisWeekMicros: 0,
      spentThisWeekMicros: 11_000,
      blockedThisWeek: 3,
    },
    {
      employeeId: "eli",
      name: "Eli",
      tierId: "engineer",
      disabled: false,
      spentTodayMicros: 10_000,
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "pool", weeklyCapMicros: 20_000 },
      poolDrawsThisWeekMicros: 22_000,
      spentThisWeekMicros: 32_000,
      blockedThisWeek: 1,
    },
    {
      employeeId: "sam",
      name: "Sam",
      tierId: "staff",
      disabled: false,
      spentTodayMicros: 23_000,
      dailyAllowanceMicros: 50_000,
      overflow: { kind: "pool", weeklyCapMicros: null },
      poolDrawsThisWeekMicros: 0,
      spentThisWeekMicros: 23_000,
      blockedThisWeek: 0,
    },
    {
      employeeId: "dee",
      name: "Dee",
      tierId: "intern",
      disabled: true,
      spentTodayMicros: 0,
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "block" },
      poolDrawsThisWeekMicros: 0,
      spentThisWeekMicros: 0,
      blockedThisWeek: 0,
    },
  ],
  projects: [
    { projectTag: "checkout", spentThisWeekMicros: 40_000, requests: 4, blockedRequests: 0 },
    { projectTag: null, spentThisWeekMicros: 26_000, requests: 3, blockedRequests: 4 },
  ],
};

/** A fresh week: nobody has sent a request yet. */
export const emptyUsageReport: UsageReport = {
  ...usageReport,
  company: { ...usageReport.company, spentThisWeekMicros: 0 },
  employees: usageReport.employees.map((employee) => ({
    ...employee,
    spentTodayMicros: 0,
    poolDrawsThisWeekMicros: 0,
    spentThisWeekMicros: 0,
    blockedThisWeek: 0,
  })),
  projects: [],
};
