/**
 * Conversions between dollars and micro-dollars: seed and admin input, provider-reported costs,
 * and the dollar text in error messages.
 */

import { expect, it } from "vitest";
import { formatUsd, providerCostToMicros, usdToMicros } from "./money.ts";

it("converts dollars to whole micro-dollars, rounding float noise away", () => {
  expect(usdToMicros(0)).toBe(0);
  expect(usdToMicros(0.01)).toBe(10_000);
  expect(usdToMicros(0.07)).toBe(70_000);
  expect(usdToMicros(1_000_000)).toBe(1_000_000_000_000);
});

it("rounds a provider's reported cost up to the next micro-dollar, so it never undercharges", () => {
  expect(providerCostToMicros(0)).toBe(0);
  expect(providerCostToMicros(0.0000001)).toBe(1);
  expect(providerCostToMicros(0.000125)).toBe(125);
});

it("formats micro-dollars as dollars with two decimals", () => {
  expect(formatUsd(10_000)).toBe("$0.01");
  expect(formatUsd(50_000)).toBe("$0.05");
  expect(formatUsd(1_234_560_000)).toBe("$1234.56");
});
