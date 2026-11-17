/**
 * The repo's demo seed loads, and holds the company, tiers and keys the .http files and the
 * phase 1 demo rely on.
 */

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSeed } from "../src/seed/load.ts";

it("loads seed/company.json with the demo company, tiers and keys", () => {
  const contents = parseSeed(JSON.parse(readFileSync("seed/company.json", "utf8")));
  expect(contents.company).toMatchObject({ id: "acme", weeklyPoolMicros: 1_000_000 });
  expect(contents.tiers).toEqual([
    { id: "intern", name: "Intern", dailyAllowanceMicros: 10_000, overflow: { kind: "block" } },
    {
      id: "engineer",
      name: "Engineer",
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "pool", weeklyCapMicros: 20_000 },
    },
    {
      id: "staff",
      name: "Staff",
      dailyAllowanceMicros: 50_000,
      overflow: { kind: "pool", weeklyCapMicros: null },
    },
  ]);
  const keys = contents.employees.map((employee) => [
    employee.apiKey,
    employee.tierId,
    employee.disabled,
  ]);
  expect(keys).toEqual([
    ["key-intern", "intern", false],
    ["key-engineer", "engineer", false],
    ["key-staff", "staff", false],
    ["key-disabled", "intern", true],
  ]);
});
