/**
 * Resolves the limits that apply to one employee: their tier's numbers with any per-employee
 * overrides applied. Overrides change numbers only, never the overflow policy's kind.
 */

import type { Micros, OverflowPolicy, Overrides, Tier } from "./types.ts";

/** The allowance and overflow policy the budget rules use for one employee. */
export type EffectiveLimits = { dailyAllowanceMicros: Micros; overflow: OverflowPolicy };

/** Applies `overrides` to `tier`. A pool-cap override on a block tier has no effect. */
export function effectiveLimits(tier: Tier, overrides: Overrides): EffectiveLimits {
  return {
    dailyAllowanceMicros: overrides.dailyAllowanceMicros ?? tier.dailyAllowanceMicros,
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
