/**
 * Budget periods: days start at 00:00 UTC, weeks at Monday 00:00 UTC, and a boundary instant
 * belongs to the new period, whatever the machine's time zone.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayStart,
  isWithin,
  nextDayStart,
  nextWeekStart,
  thisWeek,
  today,
  weekStart,
} from "./periods.ts";

const at = (iso: string) => new Date(iso);

describe("days", () => {
  it("starts the day at 00:00 UTC and the next one 24 hours later", () => {
    expect(dayStart(at("2026-11-18T15:30:00.000Z"))).toEqual(at("2026-11-18T00:00:00.000Z"));
    expect(nextDayStart(at("2026-11-18T15:30:00.000Z"))).toEqual(at("2026-11-19T00:00:00.000Z"));
  });

  it("puts midnight exactly in the new day", () => {
    expect(dayStart(at("2026-11-19T00:00:00.000Z"))).toEqual(at("2026-11-19T00:00:00.000Z"));
    expect(nextDayStart(at("2026-11-19T00:00:00.000Z"))).toEqual(at("2026-11-20T00:00:00.000Z"));
  });
});

describe("weeks", () => {
  it.each([
    ["Monday", "2026-11-16T09:00:00.000Z"],
    ["Wednesday", "2026-11-18T12:00:00.000Z"],
    ["Sunday's last millisecond", "2026-11-22T23:59:59.999Z"],
  ])("starts the week containing %s on Monday 00:00 UTC", (_, iso) => {
    expect(weekStart(at(iso))).toEqual(at("2026-11-16T00:00:00.000Z"));
    expect(nextWeekStart(at(iso))).toEqual(at("2026-11-23T00:00:00.000Z"));
  });

  it("puts Monday 00:00 UTC exactly in the new week", () => {
    expect(weekStart(at("2026-11-23T00:00:00.000Z"))).toEqual(at("2026-11-23T00:00:00.000Z"));
    expect(nextWeekStart(at("2026-11-23T00:00:00.000Z"))).toEqual(at("2026-11-30T00:00:00.000Z"));
  });

  it("finds the Monday in the previous year for a week that spans New Year", () => {
    const newYearsDay = at("2027-01-01T12:00:00.000Z");
    expect(weekStart(newYearsDay)).toEqual(at("2026-12-28T00:00:00.000Z"));
    expect(nextWeekStart(newYearsDay)).toEqual(at("2027-01-04T00:00:00.000Z"));
    expect(nextDayStart(at("2026-12-31T23:00:00.000Z"))).toEqual(at("2027-01-01T00:00:00.000Z"));
  });
});

describe("windows", () => {
  it("includes the start of today and this week but not the start of the next", () => {
    const now = at("2026-11-18T12:00:00.000Z");
    expect(isWithin(at("2026-11-18T00:00:00.000Z"), today(now))).toBe(true);
    expect(isWithin(at("2026-11-19T00:00:00.000Z"), today(now))).toBe(false);
    expect(isWithin(at("2026-11-16T00:00:00.000Z"), thisWeek(now))).toBe(true);
    expect(isWithin(at("2026-11-23T00:00:00.000Z"), thisWeek(now))).toBe(false);
  });
});

describe("time zones", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Each instant falls on a different local day than its UTC day in that zone, so a local-time
  // method anywhere in periods.ts would move a boundary.
  it.each([
    [
      "America/Chicago",
      "2026-11-23T01:00:00.000Z",
      "2026-11-23T00:00:00.000Z",
      "2026-11-23T00:00:00.000Z",
    ],
    [
      "Asia/Tokyo",
      "2026-11-22T23:30:00.000Z",
      "2026-11-22T00:00:00.000Z",
      "2026-11-16T00:00:00.000Z",
    ],
  ])("gives the same UTC boundaries with TZ=%s", (tz, iso, day, week) => {
    // Node re-reads TZ whenever it's assigned, so local-time methods would shift with it.
    vi.stubEnv("TZ", tz);
    const instant = at(iso);
    expect(dayStart(instant)).toEqual(at(day));
    expect(nextDayStart(instant)).toEqual(new Date(at(day).getTime() + 86_400_000));
    expect(weekStart(instant)).toEqual(at(week));
    expect(nextWeekStart(instant)).toEqual(new Date(at(week).getTime() + 7 * 86_400_000));
  });
});
