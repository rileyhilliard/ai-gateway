/**
 * Effective limits: a tier's allowance and overflow policy with an employee's overrides
 * applied. Overrides change numbers, never whether the tier blocks or draws from the pool.
 */

import { describe, expect, it } from "vitest";
import { makeTier, usd } from "../../tests/helpers/fixtures.ts";
import { effectiveLimits } from "./limits.ts";

const capped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: usd(2) } });
const uncapped = makeTier({ overflow: { kind: "pool", weeklyCapMicros: null } });
const blocking = makeTier({ overflow: { kind: "block" } });

describe("effectiveLimits", () => {
  it("uses the tier's numbers when there are no overrides", () => {
    expect(effectiveLimits(capped, {})).toEqual({
      dailyAllowanceMicros: usd(0.5),
      overflow: { kind: "pool", weeklyCapMicros: usd(2) },
    });
  });

  it("replaces the daily allowance with the override", () => {
    expect(effectiveLimits(capped, { dailyAllowanceMicros: usd(3) }).dailyAllowanceMicros).toBe(
      usd(3),
    );
  });

  it("honors a $0 allowance override instead of falling back to the tier", () => {
    expect(effectiveLimits(capped, { dailyAllowanceMicros: 0 }).dailyAllowanceMicros).toBe(0);
  });

  it("caps an uncapped pool tier with a number override", () => {
    expect(effectiveLimits(uncapped, { poolCapMicros: usd(1) }).overflow).toEqual({
      kind: "pool",
      weeklyCapMicros: usd(1),
    });
  });

  it("uncaps a capped pool tier with a null override", () => {
    expect(effectiveLimits(capped, { poolCapMicros: null }).overflow).toEqual({
      kind: "pool",
      weeklyCapMicros: null,
    });
  });

  it("ignores a pool-cap override on a block tier", () => {
    expect(effectiveLimits(blocking, { poolCapMicros: usd(5) }).overflow).toEqual({
      kind: "block",
    });
  });

  it("applies the same overrides to whichever tier the employee is moved to", () => {
    const overrides = { dailyAllowanceMicros: usd(1), poolCapMicros: usd(4) };
    expect(effectiveLimits(uncapped, overrides)).toEqual({
      dailyAllowanceMicros: usd(1),
      overflow: { kind: "pool", weeklyCapMicros: usd(4) },
    });
    expect(effectiveLimits(blocking, overrides)).toEqual({
      dailyAllowanceMicros: usd(1),
      overflow: { kind: "block" },
    });
  });
});
