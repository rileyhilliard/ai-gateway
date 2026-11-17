/**
 * The three spend sums: company spend this week (both buckets), an employee's personal spend
 * today, and an employee's pool draws this week. Blocked records never count.
 */

import { describe, expect, it } from "vitest";
import { makeRecord, NOW, usd } from "../../tests/helpers/fixtures.ts";
import { companySpendThisWeek, personalSpendToday, poolDrawsThisWeek } from "./spend.ts";

const MONDAY = new Date("2026-11-16T00:00:00.000Z");
const TODAY = new Date("2026-11-18T00:00:00.000Z");
const LAST_SUNDAY = new Date("2026-11-15T23:59:59.999Z");

describe("companySpendThisWeek", () => {
  it("adds personal and pool spend from every employee since Monday", () => {
    const records = [
      makeRecord({ costMicros: usd(1), bucket: "personal", startedAt: MONDAY }),
      makeRecord({ costMicros: usd(2), bucket: "pool", employeeId: "grace" }),
    ];
    expect(companySpendThisWeek(records, "acme", NOW)).toBe(usd(3));
  });

  it("ignores last week's records and other companies' records", () => {
    const records = [
      makeRecord({ costMicros: usd(1), startedAt: LAST_SUNDAY }),
      makeRecord({ costMicros: usd(2), companyId: "globex" }),
    ];
    expect(companySpendThisWeek(records, "acme", NOW)).toBe(0);
  });
});

describe("personalSpendToday", () => {
  it("counts only this employee's personal-bucket records since 00:00 UTC", () => {
    const records = [
      makeRecord({ costMicros: usd(0.1), startedAt: TODAY }),
      makeRecord({ costMicros: usd(0.2), bucket: "pool" }),
      makeRecord({ costMicros: usd(0.4), employeeId: "grace" }),
      makeRecord({ costMicros: usd(0.8), startedAt: new Date("2026-11-17T23:59:59.999Z") }),
    ];
    expect(personalSpendToday(records, "ada", NOW)).toBe(usd(0.1));
  });
});

describe("poolDrawsThisWeek", () => {
  it("counts only this employee's pool-bucket records since Monday", () => {
    const records = [
      makeRecord({ costMicros: usd(0.1), bucket: "pool", startedAt: MONDAY }),
      makeRecord({ costMicros: usd(0.2), bucket: "personal" }),
      makeRecord({ costMicros: usd(0.4), bucket: "pool", employeeId: "grace" }),
      makeRecord({ costMicros: usd(0.8), bucket: "pool", startedAt: LAST_SUNDAY }),
    ];
    expect(poolDrawsThisWeek(records, "ada", NOW)).toBe(usd(0.1));
  });
});

describe("blocked records", () => {
  it("add nothing to any sum", () => {
    const blocked = makeRecord({
      status: "blocked",
      bucket: null,
      blockReason: "pool_cap_reached",
      costMicros: 0,
    });
    expect(companySpendThisWeek([blocked], "acme", NOW)).toBe(0);
    expect(personalSpendToday([blocked], "ada", NOW)).toBe(0);
    expect(poolDrawsThisWeek([blocked], "ada", NOW)).toBe(0);
  });
});
