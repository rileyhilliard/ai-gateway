/**
 * The demo clock: it follows the real clock plus an offset that admins can only grow.
 */

import { describe, expect, it } from "vitest";
import { createDemoClock } from "./demo-clock.ts";

const HOUR = 3_600_000;

describe("createDemoClock", () => {
  it("starts at the base clock's time and keeps following it", () => {
    let base = new Date("2026-11-18T12:00:00.000Z");
    const clock = createDemoClock(() => base);
    expect(clock.now()).toEqual(base);
    base = new Date("2026-11-18T12:00:05.000Z");
    expect(clock.now()).toEqual(base);
  });

  it("moves forward by each advance, adding them up, and returns the new time", () => {
    const clock = createDemoClock(() => new Date("2026-11-18T12:00:00.000Z"));
    expect(clock.advance(12 * HOUR)).toEqual(new Date("2026-11-19T00:00:00.000Z"));
    clock.advance(HOUR);
    expect(clock.now()).toEqual(new Date("2026-11-19T01:00:00.000Z"));
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("refuses to advance by %s", (ms) => {
    const clock = createDemoClock(() => new Date("2026-11-18T12:00:00.000Z"));
    expect(() => clock.advance(ms)).toThrow(RangeError);
    expect(clock.now()).toEqual(new Date("2026-11-18T12:00:00.000Z"));
  });
});
