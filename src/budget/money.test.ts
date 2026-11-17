/**
 * Dollar to micro-dollar conversion for seed and admin input.
 */

import { expect, it } from "vitest";
import { usdToMicros } from "./money.ts";

it("converts dollars to whole micro-dollars, rounding float noise away", () => {
  expect(usdToMicros(0)).toBe(0);
  expect(usdToMicros(0.01)).toBe(10_000);
  expect(usdToMicros(0.07)).toBe(70_000);
  expect(usdToMicros(1_000_000)).toBe(1_000_000_000_000);
});
