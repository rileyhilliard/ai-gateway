/**
 * Budget periods: days start at 00:00 UTC, weeks at Monday 00:00 UTC, and a boundary instant
 * belongs to the new period, whatever the machine's time zone.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { dayStart, nextDayStart, nextWeekStart, weekStart } from "./periods.ts";

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
});

describe("time zones", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["America/Chicago", "Asia/Tokyo"])("gives the same UTC boundaries with TZ=%s", (tz) => {
    // Node re-reads TZ whenever it's assigned, so local-time methods would shift with it.
    vi.stubEnv("TZ", tz);
    // 23:30 UTC Sunday is already Monday in Tokyo and still Sunday afternoon in Chicago.
    const lateSunday = at("2026-11-22T23:30:00.000Z");
    expect(dayStart(lateSunday)).toEqual(at("2026-11-22T00:00:00.000Z"));
    expect(weekStart(lateSunday)).toEqual(at("2026-11-16T00:00:00.000Z"));
  });
});
