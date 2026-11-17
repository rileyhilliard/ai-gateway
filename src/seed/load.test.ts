/**
 * Seed parsing: dollars in, exact micro-dollars out, and a SeedError naming the path of every
 * problem. The repo's own seed file is checked in tests/seed-file.test.ts.
 */

import { describe, expect, it } from "vitest";
import { parseSeed, SeedError } from "./load.ts";

const validSeed = () => ({
  company: { id: "acme", name: "Acme", weeklyPoolUsd: 1 },
  tiers: [
    { id: "intern", name: "Intern", dailyAllowanceUsd: 0.1, overflow: { kind: "block" } },
    {
      id: "engineer",
      name: "Engineer",
      dailyAllowanceUsd: 0.01,
      overflow: { kind: "pool", weeklyCapUsd: 0.02 },
    },
    {
      id: "staff",
      name: "Staff",
      dailyAllowanceUsd: 0.05,
      overflow: { kind: "pool", weeklyCapUsd: null },
    },
  ],
  employees: [
    { id: "ada", name: "Ada", tierId: "engineer", apiKey: "key-ada" },
    {
      id: "grace",
      name: "Grace",
      tierId: "intern",
      apiKey: "key-grace",
      disabled: true,
      overrides: { dailyAllowanceUsd: 0.3, poolCapUsd: null },
    },
  ],
});

function issuePaths(json: unknown): string[] {
  try {
    parseSeed(json);
  } catch (error) {
    if (error instanceof SeedError) return error.issues.map((issue) => issue.path);
    throw error;
  }
  throw new Error("expected a SeedError");
}

describe("parseSeed", () => {
  it("converts dollars to exact micro-dollars", () => {
    const contents = parseSeed(validSeed());
    expect(contents.company).toEqual({ id: "acme", name: "Acme", weeklyPoolMicros: 1_000_000 });
    // 0.1 is not exact in binary floating point; it must still become 100,000, not 99,999.
    expect(contents.tiers[0]?.dailyAllowanceMicros).toBe(100_000);
    expect(contents.tiers[1]).toEqual({
      id: "engineer",
      name: "Engineer",
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "pool", weeklyCapMicros: 20_000 },
    });
    expect(contents.tiers[2]?.overflow).toEqual({ kind: "pool", weeklyCapMicros: null });
  });

  it("fills employee defaults and converts overrides, keeping null as uncapped", () => {
    const [ada, grace] = parseSeed(validSeed()).employees;
    expect(ada).toEqual({
      id: "ada",
      companyId: "acme",
      name: "Ada",
      tierId: "engineer",
      overrides: {},
      apiKey: "key-ada",
      disabled: false,
    });
    expect(grace?.disabled).toBe(true);
    expect(grace?.overrides).toEqual({ dailyAllowanceMicros: 300_000, poolCapMicros: null });
  });

  it("starts with no usage", () => {
    expect(parseSeed(validSeed()).usage ?? []).toEqual([]);
  });

  it("rejects a negative pool with its path", () => {
    const seed = { ...validSeed(), company: { id: "acme", name: "Acme", weeklyPoolUsd: -1 } };
    expect(issuePaths(seed)).toContain("company.weeklyPoolUsd");
  });

  it("rejects a negative allowance or pool cap with its path", () => {
    const seed = {
      ...validSeed(),
      tiers: [
        { id: "intern", name: "Intern", dailyAllowanceUsd: -0.01, overflow: { kind: "block" } },
        {
          id: "engineer",
          name: "Engineer",
          dailyAllowanceUsd: 0.01,
          overflow: { kind: "pool", weeklyCapUsd: -5 },
        },
      ],
    };
    expect(issuePaths(seed)).toEqual(
      expect.arrayContaining(["tiers.0.dailyAllowanceUsd", "tiers.1.overflow.weeklyCapUsd"]),
    );
  });

  it("rejects an employee whose tier doesn't exist", () => {
    const seed = validSeed();
    if (seed.employees[0]) seed.employees[0].tierId = "ghost";
    expect(issuePaths(seed)).toContain("employees.0.tierId");
  });

  it("rejects two employees with the same key", () => {
    const seed = validSeed();
    if (seed.employees[1]) seed.employees[1].apiKey = "key-ada";
    expect(issuePaths(seed)).toContain("employees.1.apiKey");
  });

  it.each([
    ["a string", "not a seed"],
    ["an object without a company", { tiers: [], employees: [] }],
  ])("rejects %s with a SeedError", (_, json) => {
    expect(() => parseSeed(json)).toThrow(SeedError);
  });
});
