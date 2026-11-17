/**
 * Checks the per-person rules: allowance used, at-limit for each overflow policy, the cost
 * ranking's fold into "N others", and the needs-attention reasons.
 */

import { describe, expect, test } from "vitest";
import type { EmployeeUsage } from "../../api/usage";
import { allowanceUsed, isAtLimit, needsAttention, personStatus, rankSpenders } from "./people";

function person(overrides: Partial<EmployeeUsage>): EmployeeUsage {
  return {
    employeeId: "e",
    name: "Pat",
    tierId: "intern",
    disabled: false,
    spentTodayMicros: 0,
    dailyAllowanceMicros: 10_000,
    overflow: { kind: "block" },
    poolDrawsThisWeekMicros: 0,
    spentThisWeekMicros: 0,
    blockedThisWeek: 0,
    ...overrides,
  };
}

const capped = { kind: "pool", weeklyCapMicros: 20_000 } as const;
const uncapped = { kind: "pool", weeklyCapMicros: null } as const;

describe("allowance used today", () => {
  test("is today's spend over the allowance, past 100% when the last request overshot", () => {
    expect(allowanceUsed(person({ spentTodayMicros: 11_000 }))).toEqual({
      kind: "share",
      share: 1.1,
    });
  });

  test("is 'pool only' for a $0 allowance instead of a division by zero", () => {
    expect(allowanceUsed(person({ dailyAllowanceMicros: 0 }))).toEqual({ kind: "pool-only" });
  });
});

describe("at limit", () => {
  test.each([
    ["block tier with the allowance used", person({ spentTodayMicros: 10_000 }), true],
    ["block tier under the allowance", person({ spentTodayMicros: 9_999 }), false],
    [
      "capped pool tier with allowance and cap used",
      person({ overflow: capped, spentTodayMicros: 10_000, poolDrawsThisWeekMicros: 20_000 }),
      true,
    ],
    [
      "capped pool tier with the cap used but a fresh allowance",
      person({ overflow: capped, spentTodayMicros: 0, poolDrawsThisWeekMicros: 20_000 }),
      false,
    ],
    [
      "capped pool tier with the allowance used and cap left",
      person({ overflow: capped, spentTodayMicros: 10_000, poolDrawsThisWeekMicros: 19_999 }),
      false,
    ],
    [
      "uncapped pool tier, however much it drew",
      person({ overflow: uncapped, spentTodayMicros: 50_000, poolDrawsThisWeekMicros: 900_000 }),
      false,
    ],
  ])("%s: %s", (_case, employee, expected) => {
    expect(isAtLimit(employee)).toBe(expected);
  });

  test("a disabled person shows Disabled even when at their limit", () => {
    expect(personStatus(person({ disabled: true, spentTodayMicros: 10_000 }))).toBe("disabled");
    expect(personStatus(person({ spentTodayMicros: 10_000 }))).toBe("at-limit");
    expect(personStatus(person({}))).toBe("none");
  });
});

describe("cost ranking", () => {
  test("ranks spenders by cost with their share, leaving out people who spent nothing", () => {
    const people = [
      person({ name: "Low", spentThisWeekMicros: 25_000 }),
      person({ name: "Idle", spentThisWeekMicros: 0 }),
      person({ name: "High", spentThisWeekMicros: 75_000 }),
    ];
    expect(rankSpenders(people, 100_000)).toEqual([
      { label: "High", spentThisWeekMicros: 75_000, share: 0.75 },
      { label: "Low", spentThisWeekMicros: 25_000, share: 0.25 },
    ]);
  });

  test("shows the top eight by name and folds the rest into 'N others'", () => {
    const people = Array.from({ length: 10 }, (_, index) =>
      person({ name: `P${index}`, spentThisWeekMicros: (index + 1) * 1_000 }),
    );
    const ranked = rankSpenders(people, 55_000);
    expect(ranked.map((bar) => bar.label)).toEqual([
      "P9",
      "P8",
      "P7",
      "P6",
      "P5",
      "P4",
      "P3",
      "P2",
      "2 others",
    ]);
    expect(ranked.at(-1)).toEqual({ label: "2 others", spentThisWeekMicros: 3_000, share: 3 / 55 });
  });

  test("a single folded person reads '1 other'", () => {
    const people = Array.from({ length: 9 }, (_, index) =>
      person({ name: `P${index}`, spentThisWeekMicros: 1_000 }),
    );
    expect(rankSpenders(people, 9_000).at(-1)?.label).toBe("1 other");
  });
});

describe("needs attention", () => {
  test("lists blocked and at-limit people, most blocked first, with the reason", () => {
    const people = [
      person({ employeeId: "a", name: "Ivy", blockedThisWeek: 3, spentTodayMicros: 11_000 }),
      person({
        employeeId: "b",
        name: "Eli",
        overflow: capped,
        blockedThisWeek: 1,
        spentTodayMicros: 0,
        poolDrawsThisWeekMicros: 22_000,
      }),
      person({ employeeId: "c", name: "Sam", overflow: uncapped, blockedThisWeek: 2 }),
      person({ employeeId: "d", name: "Dee", disabled: true, blockedThisWeek: 5 }),
      person({ employeeId: "e", name: "Ok" }),
    ];
    expect(needsAttention(people)).toEqual([
      {
        employeeId: "a",
        name: "Ivy",
        reasons: [
          "Blocked 3 times this week; their daily allowance is $0.0100.",
          "At their limit now: today's allowance is used, so requests are blocked until 00:00 UTC.",
        ],
      },
      {
        employeeId: "c",
        name: "Sam",
        reasons: [
          "Blocked 2 times this week; their pool draws are uncapped, so the company pool ran out.",
        ],
      },
      {
        employeeId: "b",
        name: "Eli",
        reasons: [
          "Blocked once this week; their daily allowance is $0.0100 and their weekly pool cap is $0.0200.",
        ],
      },
    ]);
  });

  test("lists someone at their limit who hasn't been blocked yet", () => {
    const atLimit = person({ name: "Ivy", spentTodayMicros: 10_000 });
    expect(needsAttention([atLimit]).map((item) => item.reasons)).toEqual([
      ["At their limit now: today's allowance is used, so requests are blocked until 00:00 UTC."],
    ]);
  });
});
