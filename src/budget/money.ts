/**
 * Every conversion between dollars and the integer micro-dollars the app stores. Admin-entered
 * dollars (seed file, admin API) round to the nearest micro-dollar; a provider's reported cost
 * rounds up, so the gateway never undercharges. Dollars as text appear only in error messages.
 */

import type { Micros } from "./types.ts";

const MICROS_PER_DOLLAR = 1_000_000;

/**
 * The largest dollar amount the seed or admin API accepts. It keeps every stored amount, and any
 * plausible sum of them, far below Number.MAX_SAFE_INTEGER micro-dollars.
 */
export const MAX_USD = 1_000_000;

/** Converts admin-entered dollars to micro-dollars, rounding to the nearest micro-dollar. */
export function usdToMicros(usd: number): Micros {
  return Math.round(usd * MICROS_PER_DOLLAR);
}

/** Converts a provider's reported cost in dollars (OpenRouter's `usage.cost`), rounding up. */
export function providerCostToMicros(usd: number): Micros {
  // The product carries float noise (0.000123 * 1e6 is 123.00000000000001). Rounding it to six
  // decimals first drops the noise, so the ceiling only rounds up a real fraction of a micro.
  const micros = Number((usd * MICROS_PER_DOLLAR).toFixed(6));
  return Math.ceil(micros);
}

/** Micro-dollars as dollars with two decimals, for messages: 10_000 is "$0.01". */
export function formatUsd(micros: Micros): string {
  return `$${(micros / MICROS_PER_DOLLAR).toFixed(2)}`;
}
