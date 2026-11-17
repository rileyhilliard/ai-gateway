/**
 * Resolves the limits that apply to one employee: their tier's numbers with any per-employee
 * overrides applied, and a percent-of-pool allowance turned into micro-dollars against the
 * current pool. Overrides change numbers only, never the overflow policy's kind.
 */

import type { DailyAllowance, Micros, OverflowPolicy, Overrides, Tier } from "./types.ts";

/** The allowance and overflow policy the budget rules use for one employee. */
export type EffectiveLimits = { dailyAllowanceMicros: Micros; overflow: OverflowPolicy };

/**
 * Applies `overrides` to `tier`. A pool-cap override on a block tier has no effect.
 *
 * @param weeklyPoolMicros The company's pool now, which a percent-of-pool allowance is a share of.
 */
export function effectiveLimits(
  tier: Tier,
  overrides: Overrides,
  weeklyPoolMicros: Micros,
): EffectiveLimits {
  return {
    dailyAllowanceMicros:
      overrides.dailyAllowanceMicros ?? allowanceMicros(tier.dailyAllowance, weeklyPoolMicros),
    overflow: overflowWithCapOverride(tier.overflow, overrides),
  };
}

/** The tier's overflow policy, with the pool-cap override applied when the tier draws from the pool. */
function overflowWithCapOverride(overflow: OverflowPolicy, overrides: Overrides): OverflowPolicy {
  if (overflow.kind === "block") return overflow;
  // null is a real override meaning "uncapped", so only a missing field keeps the tier's cap.
  if (overrides.poolCapMicros === undefined) return overflow;
  return { kind: "pool", weeklyCapMicros: overrides.poolCapMicros };
}

/** A tier's allowance in micro-dollars. A pool share rounds down, so it never exceeds the share. */
function allowanceMicros(allowance: DailyAllowance, weeklyPoolMicros: Micros): Micros {
  if (allowance.kind === "fixed") return allowance.micros;
  // BigInt because the largest pool times 10,000 basis points is past Number's exact range.
  return Number((BigInt(weeklyPoolMicros) * BigInt(allowance.basisPoints)) / 10_000n);
}
