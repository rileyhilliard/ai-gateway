/**
 * Checks the week-elapsed fraction and the pool projection the pool panel's status line reads,
 * including the guards for a spent pool and the first minutes of the week.
 */

import { expect, test } from "vitest";
import { poolPace, weekElapsedFraction } from "./pace";

const weekResetsAt = "2026-11-23T00:00:00.000Z";

test.each([
  ["2026-11-16T00:00:00.000Z", 0],
  ["2026-11-19T12:00:00.000Z", 0.5],
  ["2026-11-23T00:00:00.000Z", 1],
])("at %s the week is %f elapsed", (asOf, expected) => {
  expect(weekElapsedFraction(asOf, weekResetsAt)).toBeCloseTo(expected);
});

const halfway = { asOf: "2026-11-19T12:00:00.000Z", weekResetsAt, weeklyPoolMicros: 1_000_000 };

test("spend under half the pool at halfway is on pace", () => {
  expect(poolPace({ ...halfway, spentThisWeekMicros: 400_000 })).toEqual({
    kind: "on-pace",
    projectedMicros: 800_000,
    poolShare: 0.8,
  });
});

test("spend over half the pool at halfway is over pace", () => {
  expect(poolPace({ ...halfway, spentThisWeekMicros: 600_000 })).toEqual({
    kind: "over-pace",
    projectedMicros: 1_200_000,
    poolShare: 1.2,
  });
});

test("a projection landing exactly on the pool is still on pace", () => {
  expect(poolPace({ ...halfway, spentThisWeekMicros: 500_000 }).kind).toBe("on-pace");
});

test("a spent pool says so instead of projecting", () => {
  expect(poolPace({ ...halfway, spentThisWeekMicros: 1_000_000 })).toEqual({ kind: "pool-spent" });
});

test("the first 2% of the week is too early to project", () => {
  // 3 hours in is 1.8% of the week.
  const early = { ...halfway, asOf: "2026-11-16T03:00:00.000Z", spentThisWeekMicros: 10_000 };
  expect(poolPace(early)).toEqual({ kind: "too-early" });
  // 4 hours in is 2.4%, enough to project.
  expect(poolPace({ ...early, asOf: "2026-11-16T04:00:00.000Z" }).kind).toBe("on-pace");
});
