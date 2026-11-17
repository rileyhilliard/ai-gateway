/**
 * Pins the header's UTC reset time, countdown, week range and freshness text.
 */

import { expect, test } from "vitest";
import {
  formatAge,
  formatClockTime,
  formatCountdown,
  formatResetTime,
  formatWeekRange,
} from "./time";

test.each([
  ["2026-11-23T00:00:00.000Z", "16–22 Nov"],
  ["2026-12-07T00:00:00.000Z", "30 Nov – 6 Dec"],
])("the week that resets at %s runs %s", (resetsAt, expected) => {
  expect(formatWeekRange(resetsAt)).toBe(expected);
});

test("the reset time is a UTC weekday and clock time", () => {
  expect(formatResetTime("2026-11-23T00:00:00.000Z")).toBe("Mon 00:00 UTC");
});

test("a clock time is UTC with seconds", () => {
  expect(formatClockTime(Date.parse("2026-11-18T14:02:10.500Z"))).toBe("14:02:10 UTC");
});

test.each([
  ["2026-11-20T21:00:00.000Z", "2d 3h"],
  ["2026-11-22T20:48:00.000Z", "3h 12m"],
  ["2026-11-22T23:15:00.000Z", "45m"],
  ["2026-11-22T23:59:30.000Z", "<1m"],
  ["2026-11-23T01:00:00.000Z", "<1m"],
])("from %s the countdown to Monday is %s", (from, expected) => {
  expect(formatCountdown(from, "2026-11-23T00:00:00.000Z")).toBe(expected);
});

test.each([
  [2_400, "2 s ago"],
  [59_999, "59 s ago"],
  [180_000, "3 min ago"],
])("data %i ms old was updated %s", (ageMs, expected) => {
  expect(formatAge(1_000_000, 1_000_000 + ageMs)).toBe(expected);
});
