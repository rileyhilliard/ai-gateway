/**
 * Pins how micro-dollars and ratios read on the dashboard: two decimals from $1, four below,
 * and percents that never round a real share down to nothing.
 */

import { expect, test } from "vitest";
import { formatMoney, formatPercent, ratioOf } from "./money";

test.each([
  [1_234_560_000, "$1,234.56"],
  [1_000_000, "$1.00"],
  [999_999, "$1.0000"],
  [11_000, "$0.0110"],
  [110, "$0.0001"],
  [0, "$0.00"],
])("formatMoney(%i) is %s", (micros, expected) => {
  expect(formatMoney(micros)).toBe(expected);
});

test.each([
  [0.066, "7%"],
  [1.354, "135%"],
  [0.004, "<1%"],
  [0, "0%"],
])("formatPercent(%f) is %s", (ratio, expected) => {
  expect(formatPercent(ratio)).toBe(expected);
});

test("ratioOf is 0 for an empty whole instead of dividing by zero", () => {
  expect(ratioOf(5, 0)).toBe(0);
  expect(ratioOf(1, 4)).toBe(0.25);
});
