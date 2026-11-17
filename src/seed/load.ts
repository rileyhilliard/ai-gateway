/**
 * Validates the seed JSON (company, tiers, employees, in dollars) and converts it into store
 * contents in micro-dollars. A tier's allowance is dollars or a percent of the weekly pool,
 * stored as basis points. Reading the file is main.ts's job, since only it may touch Node.
 */

import { z } from "@hono/zod-openapi";
import { MAX_USD, usdToMicros } from "../budget/money.ts";
import type { DailyAllowance, Micros, Overrides } from "../budget/types.ts";
import type { Issue } from "../errors.ts";
import type { StoreContents } from "../store/memory.ts";

const dollars = z.number().min(0).max(MAX_USD);
// Two decimals at most, so it converts to whole basis points.
const percent = z.number().min(0).max(100).multipleOf(0.01);

const seedSchema = z.object({
  company: z.object({ id: z.string(), name: z.string(), weeklyPoolUsd: dollars }),
  tiers: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        dailyAllowanceUsd: dollars.optional(),
        dailyAllowancePercentOfPool: percent.optional(),
        overflow: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("block") }),
          z.object({ kind: z.literal("pool"), weeklyCapUsd: dollars.nullable() }),
        ]),
      })
      .refine(
        (tier) =>
          (tier.dailyAllowanceUsd === undefined) !==
          (tier.dailyAllowancePercentOfPool === undefined),
        {
          path: ["dailyAllowanceUsd"],
          message: "set exactly one of dailyAllowanceUsd or dailyAllowancePercentOfPool",
        },
      ),
  ),
  employees: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tierId: z.string(),
      apiKey: z.string(),
      disabled: z.boolean().default(false),
      overrides: z
        .object({
          dailyAllowanceUsd: dollars.optional(),
          poolCapUsd: dollars.nullable().optional(),
        })
        .default({}),
    }),
  ),
});

type SeedShape = z.infer<typeof seedSchema>;

/** The seed didn't match the expected shape or broke a rule such as unique keys. */
export class SeedError extends Error {
  override name = "SeedError";
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(`Invalid seed:\n${issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
    this.issues = issues;
  }
}

/**
 * Parses already-decoded seed JSON into store contents.
 *
 * @throws {SeedError} When the shape is wrong, an amount is negative, an employee names an
 * unknown tier, or two employees share a key.
 */
export function parseSeed(json: unknown): StoreContents {
  const parsed = seedSchema.safeParse(json);
  if (!parsed.success) {
    throw new SeedError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  const issues = findCrossFieldIssues(parsed.data);
  if (issues.length > 0) throw new SeedError(issues);
  return toStoreContents(parsed.data);
}

/** Rules a shape check can't express: employees must name a seeded tier and keys are unique. */
function findCrossFieldIssues(seed: SeedShape): Issue[] {
  const tierIds = new Set(seed.tiers.map((tier) => tier.id));
  const seenKeys = new Set<string>();
  const issues: Issue[] = [];

  seed.employees.forEach((employee, index) => {
    if (!tierIds.has(employee.tierId)) {
      issues.push({
        path: `employees.${index}.tierId`,
        message: `unknown tier "${employee.tierId}"; use one of: ${[...tierIds].join(", ")}`,
      });
    }
    if (seenKeys.has(employee.apiKey)) {
      issues.push({
        path: `employees.${index}.apiKey`,
        message: "this API key is already used by an earlier employee; keys must be unique",
      });
    }
    seenKeys.add(employee.apiKey);
  });
  return issues;
}

function toStoreContents(seed: SeedShape): StoreContents {
  return {
    company: {
      id: seed.company.id,
      name: seed.company.name,
      weeklyPoolMicros: usdToMicros(seed.company.weeklyPoolUsd),
    },
    tiers: seed.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      dailyAllowance: toAllowance(tier),
      overflow:
        tier.overflow.kind === "block"
          ? { kind: "block" }
          : { kind: "pool", weeklyCapMicros: toNullableMicros(tier.overflow.weeklyCapUsd) },
    })),
    employees: seed.employees.map((employee) => ({
      id: employee.id,
      companyId: seed.company.id,
      name: employee.name,
      tierId: employee.tierId,
      overrides: toOverrides(employee.overrides),
      apiKey: employee.apiKey,
      disabled: employee.disabled,
    })),
  };
}

/** A tier's allowance from whichever of the two fields the seed set. */
function toAllowance(tier: SeedShape["tiers"][number]): DailyAllowance {
  if (tier.dailyAllowancePercentOfPool !== undefined) {
    // Rounded because 0.07 * 100 is 7.000000000000001 in floating point.
    return {
      kind: "percentOfPool",
      basisPoints: Math.round(tier.dailyAllowancePercentOfPool * 100),
    };
  }
  if (tier.dailyAllowanceUsd !== undefined) {
    return { kind: "fixed", micros: usdToMicros(tier.dailyAllowanceUsd) };
  }
  // The schema's refine rejects a tier with neither, so reaching this is a bug.
  throw new Error(`Tier "${tier.id}" has no daily allowance after validation.`);
}

/** Converts only the override fields the seed sets, so "missing" stays distinct from `null`. */
function toOverrides(overrides: SeedShape["employees"][number]["overrides"]): Overrides {
  const converted: Overrides = {};
  if (overrides.dailyAllowanceUsd !== undefined) {
    converted.dailyAllowanceMicros = usdToMicros(overrides.dailyAllowanceUsd);
  }
  if (overrides.poolCapUsd !== undefined) {
    converted.poolCapMicros = toNullableMicros(overrides.poolCapUsd);
  }
  return converted;
}

function toNullableMicros(usd: number | null): Micros | null {
  return usd === null ? null : usdToMicros(usd);
}
