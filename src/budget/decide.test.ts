/**
 * The budget decision: company pool first (rule 3), then the daily allowance (rule 4), then the
 * tier's overflow policy (rules 5 and 6). Blocks report what was spent, the limit, and the
 * earliest time the employee could next be allowed.
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
import { decide } from "./decide.ts";
import type { Company, Employee, Tier, UsageRecord } from "./types.ts";

const TOMORROW = new Date("2026-11-19T00:00:00.000Z");
const NEXT_MONDAY = new Date("2026-11-23T00:00:00.000Z");

const capped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: usd(2) } });
const uncapped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: null } });
const blocking = makeTier({ overflow: { kind: "block" } });

function decideFor(options: {
  tier?: Tier;
  company?: Company;
  employee?: Employee;
  usage?: UsageRecord[];
  now?: Date;
}) {
  return decide({
    company: options.company ?? makeCompany(),
    tier: options.tier ?? capped,
    employee: options.employee ?? makeEmployee(),
    usage: options.usage ?? [],
    now: options.now ?? NOW,
  });
}

const personal = (dollars: number, fields: Partial<UsageRecord> = {}) =>
  makeRecord({ costMicros: usd(dollars), bucket: "personal", ...fields });
const pool = (dollars: number, fields: Partial<UsageRecord> = {}) =>
  makeRecord({ costMicros: usd(dollars), bucket: "pool", ...fields });

describe("daily allowance (rule 4)", () => {
  it("allows from personal while today's personal spend is under the allowance", () => {
    expect(decideFor({ usage: [personal(0.49)] })).toEqual({ kind: "allow", bucket: "personal" });
  });

  it("stops using personal once spend is exactly at the allowance", () => {
    expect(decideFor({ tier: blocking, usage: [personal(0.5)] })).toMatchObject({
      kind: "block",
      reason: "personal_allowance_exhausted",
    });
  });

  it("lets the last request overshoot, then moves on from personal", () => {
    // $0.10 of $0.50 spent: allowed from personal even though the request may cost more.
    expect(decideFor({ usage: [personal(0.1)] })).toEqual({ kind: "allow", bucket: "personal" });
    // That request cost $0.60, so the next one no longer comes from personal.
    expect(decideFor({ usage: [personal(0.1), personal(0.6)] })).toEqual({
      kind: "allow",
      bucket: "pool",
    });
  });
});

describe("block policy (rule 6)", () => {
  it("blocks once the allowance is used, resetting at the next 00:00 UTC", () => {
    expect(decideFor({ tier: blocking, usage: [personal(0.3), personal(0.3)] })).toEqual({
      kind: "block",
      reason: "personal_allowance_exhausted",
      spentMicros: usd(0.6),
      limitMicros: usd(0.5),
      resetsAt: TOMORROW,
    });
  });
});

describe("pool policy (rules 5 and 6)", () => {
  it("spills to the pool when the allowance is used and the cap has room", () => {
    expect(decideFor({ usage: [personal(0.5), pool(1.99)] })).toEqual({
      kind: "allow",
      bucket: "pool",
    });
  });

  it("spills to the pool without limit when the tier is uncapped", () => {
    expect(decideFor({ tier: uncapped, usage: [personal(0.5), pool(9)] })).toEqual({
      kind: "allow",
      bucket: "pool",
    });
  });

  it("blocks at the pool cap and resets at the next 00:00 UTC when the allowance refills", () => {
    expect(decideFor({ usage: [personal(0.5), pool(2)] })).toEqual({
      kind: "block",
      reason: "pool_cap_reached",
      spentMicros: usd(2),
      limitMicros: usd(2),
      resetsAt: TOMORROW,
    });
  });

  it("resets at next Monday when the allowance is $0, since nothing refills tomorrow", () => {
    const poolOnly = makeTier({ dailyAllowance: { kind: "fixed", micros: 0 } });
    expect(decideFor({ tier: poolOnly, usage: [pool(2)] })).toMatchObject({
      kind: "block",
      reason: "pool_cap_reached",
      resetsAt: NEXT_MONDAY,
    });
  });

  it("sends the first request of a $0-allowance tier straight to the pool", () => {
    const poolOnly = makeTier({ dailyAllowance: { kind: "fixed", micros: 0 } });
    expect(decideFor({ tier: poolOnly })).toEqual({ kind: "allow", bucket: "pool" });
  });

  it("blocks immediately with a $0 pool cap once the allowance is used", () => {
    const zeroCap = makeTier({ overflow: { kind: "pool", weeklyCapMicros: 0 } });
    expect(decideFor({ tier: zeroCap, usage: [personal(0.5)] })).toMatchObject({
      kind: "block",
      reason: "pool_cap_reached",
      limitMicros: 0,
    });
  });

  it("applies the employee's overrides over the tier", () => {
    const employee = makeEmployee({
      overrides: { dailyAllowanceMicros: usd(1), poolCapMicros: 0 },
    });
    expect(decideFor({ employee, usage: [personal(0.6)] })).toEqual({
      kind: "allow",
      bucket: "personal",
    });
    expect(decideFor({ employee, usage: [personal(1)] })).toMatchObject({
      kind: "block",
      reason: "pool_cap_reached",
    });
  });
});

describe("company pool (rule 3)", () => {
  const smallPool = makeCompany({ weeklyPoolMicros: usd(1) });

  it("blocks everyone once the week's spend reaches the pool, even with allowance left", () => {
    const usage = [pool(1, { employeeId: "grace" })];
    expect(decideFor({ company: smallPool, usage })).toEqual({
      kind: "block",
      reason: "company_pool_exhausted",
      spentMicros: usd(1),
      limitMicros: usd(1),
      resetsAt: NEXT_MONDAY,
    });
  });

  it("counts personal-allowance spend toward the pool", () => {
    const usage = [personal(0.5, { employeeId: "grace" }), personal(0.5, { employeeId: "linus" })];
    expect(decideFor({ company: smallPool, usage })).toMatchObject({
      reason: "company_pool_exhausted",
    });
  });

  it("blocks when the pool is lowered below what was already spent", () => {
    const lowered = makeCompany({ weeklyPoolMicros: usd(0.2) });
    expect(decideFor({ company: lowered, usage: [personal(0.3)] })).toMatchObject({
      reason: "company_pool_exhausted",
    });
  });
});

describe("percent-of-pool allowances", () => {
  // 10% of the weekly pool per day.
  const tenPercent = makeTier({
    dailyAllowance: { kind: "percentOfPool", basisPoints: 1_000 },
    overflow: { kind: "block" },
  });

  it("blocks at the pool share, reporting it as the limit", () => {
    const company = makeCompany({ weeklyPoolMicros: usd(1) });
    expect(decideFor({ tier: tenPercent, company, usage: [personal(0.1)] })).toMatchObject({
      kind: "block",
      reason: "personal_allowance_exhausted",
      spentMicros: usd(0.1),
      limitMicros: usd(0.1),
    });
  });

  it("follows a pool change at the next decision, with no other edit", () => {
    const raised = makeCompany({ weeklyPoolMicros: usd(2) });
    expect(decideFor({ tier: tenPercent, company: raised, usage: [personal(0.1)] })).toEqual({
      kind: "allow",
      bucket: "personal",
    });
  });
});

describe("admin changes mid-period", () => {
  it("spills or blocks per policy once the allowance is lowered below today's spend", () => {
    const lowered = makeTier({ dailyAllowance: { kind: "fixed", micros: usd(0.2) } });
    expect(decideFor({ tier: lowered, usage: [personal(0.3)] })).toEqual({
      kind: "allow",
      bucket: "pool",
    });
    const loweredBlocking = makeTier({
      dailyAllowance: { kind: "fixed", micros: usd(0.2) },
      overflow: { kind: "block" },
    });
    expect(decideFor({ tier: loweredBlocking, usage: [personal(0.3)] })).toMatchObject({
      reason: "personal_allowance_exhausted",
    });
  });
});

describe("resets", () => {
  it("allows again at Monday 00:00 UTC after a Sunday block, with day and week both reset", () => {
    const sunday = new Date("2026-11-22T23:59:59.000Z");
    const usage = [personal(0.5, { startedAt: sunday }), pool(2, { startedAt: sunday })];
    expect(decideFor({ usage, now: sunday })).toMatchObject({ reason: "pool_cap_reached" });
    expect(decideFor({ usage, now: NEXT_MONDAY })).toEqual({ kind: "allow", bucket: "personal" });
  });

  it("refills the allowance at 00:00 UTC while the week's pool draws carry over", () => {
    const tuesdayNight = new Date("2026-11-17T23:59:59.000Z");
    const wednesday = new Date("2026-11-18T00:00:00.000Z");
    const usage = [
      personal(0.5, { startedAt: tuesdayNight }),
      pool(2, { startedAt: tuesdayNight }),
    ];
    expect(decideFor({ usage, now: tuesdayNight })).toMatchObject({ reason: "pool_cap_reached" });
    expect(decideFor({ usage, now: wednesday })).toEqual({ kind: "allow", bucket: "personal" });
    // Personal is used up again on Wednesday: the pool cap still counts Tuesday's draws.
    const laterWednesday = [...usage, personal(0.5, { startedAt: wednesday })];
    expect(decideFor({ usage: laterWednesday, now: wednesday })).toMatchObject({
      reason: "pool_cap_reached",
    });
  });
});
