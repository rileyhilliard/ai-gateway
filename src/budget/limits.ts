/**
 * Resolves the limits that apply to one employee: their tier's numbers with any per-employee
 * overrides applied. Overrides change numbers only, never the overflow policy's kind.
 */

import type { Micros, OverflowPolicy, Overrides, Tier } from "./types.ts";

/** The allowance and overflow policy the budget rules use for one employee. */
export type EffectiveLimits = { dailyAllowanceMicros: Micros; overflow: OverflowPolicy };

/** Applies `overrides` to `tier`. A pool-cap override on a block tier has no effect. */
export function effectiveLimits(tier: Tier, overrides: Overrides): EffectiveLimits {
  throw new Error("not implemented");
}
