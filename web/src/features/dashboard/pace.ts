/**
 * Projects this week's company spend from the share of the week already gone, so the pool panel
 * can say whether the pool will last until it resets. Pure: it reads only the report's numbers.
 */

import { ratioOf } from "./money";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Below this share of the week elapsed, a projection is mostly noise from the first requests. */
export const MIN_ELAPSED_TO_PROJECT = 0.02;

/** Where the week's spend is heading, as the pool panel's status line reports it. */
export type PoolPace =
  | { kind: "pool-spent" }
  | { kind: "too-early" }
  | { kind: "on-pace"; projectedMicros: number; poolShare: number }
  | { kind: "over-pace"; projectedMicros: number; poolShare: number };

/** The inputs the projection needs, all as the gateway reports them. */
export type PaceInput = {
  asOf: string;
  weekResetsAt: string;
  spentThisWeekMicros: number;
  weeklyPoolMicros: number;
};

/**
 * The share of the current week that has passed at `asOf`, from 0 to 1. The week started 7 days
 * before it resets.
 */
export function weekElapsedFraction(asOf: string, weekResetsAt: string): number {
  const weekStartedAt = Date.parse(weekResetsAt) - WEEK_MS;
  const elapsed = (Date.parse(asOf) - weekStartedAt) / WEEK_MS;
  return Math.min(1, Math.max(0, elapsed));
}

/**
 * Projects the week's spend at the current rate and compares it with the pool. A pool that is
 * already spent outranks the projection, and the first 2% of the week is too early to project.
 */
export function poolPace(input: PaceInput): PoolPace {
  const { spentThisWeekMicros: spent, weeklyPoolMicros: pool } = input;
  if (spent >= pool) return { kind: "pool-spent" };
  const elapsed = weekElapsedFraction(input.asOf, input.weekResetsAt);
  if (elapsed < MIN_ELAPSED_TO_PROJECT) return { kind: "too-early" };
  const projectedMicros = Math.round(spent / elapsed);
  const poolShare = ratioOf(projectedMicros, pool);
  return projectedMicros <= pool
    ? { kind: "on-pace", projectedMicros, poolShare }
    : { kind: "over-pace", projectedMicros, poolShare };
}
