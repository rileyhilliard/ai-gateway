/**
 * Effective limits: a tier's allowance and overflow policy with an employee's overrides
 * applied. Overrides change numbers, never whether the tier blocks or draws from the pool.
 */

import { describe, expect, it } from "vitest";
import { makeTier, usd } from "../../tests/helpers/fixtures.ts";
import { effectiveLimits } from "./limits.ts";

// The company pool, which only percent-of-pool tiers read.
const POOL = usd(10);
const capped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: usd(2) } });
const uncapped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: null } });
const blocking = makeTier({ overflow: { kind: "block" } });

describe("effectiveLimits", () => {
  it("uses the tier's numbers when there are no overrides", () => {
    expect(effectiveLimits(capped, {}, POOL)).toEqual({
      dailyAllowanceMicros: usd(0.5),
      overflow: { kind: "pool", weeklyCapMicros: usd(2) },
    });
  });

  it("replaces the daily allowance with the override", () => {
    expect(
      effectiveLimits(capped, { dailyAllowanceMicros: usd(3) }, POOL).dailyAllowanceMicros,
    ).toBe(usd(3));
  });

  it("honors a $0 allowance override instead of falling back to the tier", () => {
    expect(effectiveLimits(capped, { dailyAllowanceMicros: 0 }, POOL).dailyAllowanceMicros).toBe(0);
  });

  it("caps an uncapped pool tier with a number override", () => {
    expect(effectiveLimits(uncapped, { poolCapMicros: usd(1) }, POOL).overflow).toEqual({
      kind: "pool",
      weeklyCapMicros: usd(1),
    });
  });

  it("uncaps a capped pool tier with a null override", () => {
    expect(effectiveLimits(capped, { poolCapMicros: null }, POOL).overflow).toEqual({
      kind: "pool",
      weeklyCapMicros: null,
    });
  });

  it("ignores a pool-cap override on a block tier", () => {
    expect(effectiveLimits(blocking, { poolCapMicros: usd(5) }, POOL).overflow).toEqual({
      kind: "block",
    });
  });

  it("applies the same overrides to whichever tier the employee is moved to", () => {
    const overrides = { dailyAllowanceMicros: usd(1), poolCapMicros: usd(4) };
    expect(effectiveLimits(uncapped, overrides, POOL)).toEqual({
      dailyAllowanceMicros: usd(1),
      overflow: { kind: "pool", weeklyCapMicros: usd(4) },
    });
    expect(effectiveLimits(blocking, overrides, POOL)).toEqual({
      dailyAllowanceMicros: usd(1),
      overflow: { kind: "block" },
    });
  });

  it("resolves a percent-of-pool allowance against the pool it's given", () => {
    const share = makeTier({ dailyAllowance: { kind: "percentOfPool", basisPoints: 250 } });
    expect(effectiveLimits(share, {}, usd(10)).dailyAllowanceMicros).toBe(usd(0.25));
    expect(effectiveLimits(share, {}, usd(20)).dailyAllowanceMicros).toBe(usd(0.5));
  });

  it("rounds a pool share down to whole micro-dollars, so it never exceeds the share", () => {
    const share = makeTier({ dailyAllowance: { kind: "percentOfPool", basisPoints: 250 } });
    // 2.5% of 1,000,003 is 25,000.075.
    expect(effectiveLimits(share, {}, 1_000_003).dailyAllowanceMicros).toBe(25_000);
  });

  it("stays exact at the largest pool the seed and admin API allow", () => {
    const share = makeTier({ dailyAllowance: { kind: "percentOfPool", basisPoints: 9_999 } });
    expect(effectiveLimits(share, {}, usd(1_000_000)).dailyAllowanceMicros).toBe(999_900_000_000);
  });

  it("lets an allowance override replace a pool share", () => {
    const share = makeTier({ dailyAllowance: { kind: "percentOfPool", basisPoints: 250 } });
    expect(
      effectiveLimits(share, { dailyAllowanceMicros: usd(3) }, POOL).dailyAllowanceMicros,
    ).toBe(usd(3));
  });
});
