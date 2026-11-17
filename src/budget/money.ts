/**
 * Converting admin-entered dollars to the integer micro-dollars the app stores. The seed file
 * and the admin API both take dollars, so they share this one conversion. Provider-reported
 * costs round up instead (src/upstream/openrouter.ts), so they never undercharge.
 */

import type { Micros } from "./types.ts";

const MICROS_PER_DOLLAR = 1_000_000;

/**
 * The largest dollar amount the seed or admin API accepts. It keeps every stored amount, and any
 * plausible sum of them, far below Number.MAX_SAFE_INTEGER micro-dollars.
 */
export const MAX_USD = 1_000_000;

/** Converts dollars to micro-dollars, rounding to the nearest micro-dollar. */
export function usdToMicros(usd: number): Micros {
  return Math.round(usd * MICROS_PER_DOLLAR);
}
