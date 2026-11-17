/**
 * A clock an admin can move forward, so a demo can show an allowance refill at 00:00 UTC or the
 * weekly reset without waiting. It wraps a real clock and adds an offset that only grows, since
 * moving time back would date new requests before ones already recorded.
 */

import type { Clock } from "../budget/types.ts";

/** The demo clock: `now` is the shifted time, `advance` moves it forward. */
export type DemoClock = {
  now: Clock;
  /**
   * Moves the clock forward and returns the new time.
   *
   * @throws {RangeError} When `milliseconds` is negative or not finite.
   */
  advance(milliseconds: number): Date;
};

/** Creates a demo clock that starts at `base` time and keeps following it. */
export function createDemoClock(base: Clock): DemoClock {
  let offsetMs = 0;
  const now = () => new Date(base().getTime() + offsetMs);
  return {
    now,
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new RangeError(`The demo clock only moves forward, got ${milliseconds} ms`);
      }
      offsetMs += milliseconds;
      return now();
    },
  };
}
