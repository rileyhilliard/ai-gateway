/**
 * Checks the per-person rules: allowance used, at-limit for each overflow policy, cost order, and
 * the needs-attention reasons.
 */

import { describe, expect, test } from "vitest";
import type { EmployeeUsage } from "../../api/usage";
import { allowanceUsed, byCostThenName, isAtLimit, needsAttention, personStatus } from "./people";

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

describe("cost order", () => {
  test("puts the highest cost this week first, then orders ties by name", () => {
    const people = [
      person({ name: "Low", spentThisWeekMicros: 25_000 }),
      person({ name: "Idle", spentThisWeekMicros: 0 }),
      person({ name: "Bea", spentThisWeekMicros: 75_000 }),
      person({ name: "Ada", spentThisWeekMicros: 75_000 }),
    ];
    expect(byCostThenName(people).map((each) => each.name)).toEqual(["Ada", "Bea", "Low", "Idle"]);
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
        reason: "Daily allowance used, blocked until 00:00 UTC",
        blockedThisWeek: 3,
      },
      { employeeId: "c", name: "Sam", reason: "Company pool ran out", blockedThisWeek: 2 },
      {
        employeeId: "b",
        name: "Eli",
        reason: "Reached their $0.0200 weekly pool cap",
        blockedThisWeek: 1,
      },
    ]);
  });

  test("lists someone at their limit who hasn't been blocked yet", () => {
    const atLimit = person({ name: "Ivy", spentTodayMicros: 10_000 });
    expect(needsAttention([atLimit])).toEqual([
      {
        employeeId: "e",
        name: "Ivy",
        reason: "Daily allowance used, blocked until 00:00 UTC",
        blockedThisWeek: 0,
      },
    ]);
  });

  test("names the cap reached for a capped pool tier, and the allowance for a block tier", () => {
    const capReached = person({
      name: "Eli",
      overflow: capped,
      spentTodayMicros: 10_000,
      poolDrawsThisWeekMicros: 20_000,
    });
    const blockedEarlier = person({ name: "Ivy", blockedThisWeek: 1 });
    expect(needsAttention([capReached, blockedEarlier]).map((item) => item.reason)).toEqual([
      "Ran past their $0.0100 daily allowance",
      "Pool cap reached",
    ]);
  });
});
