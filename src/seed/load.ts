/**
 * Validates the seed JSON (company, tiers, employees, in dollars) and converts it into store
 * contents in micro-dollars. Reading the file is main.ts's job, since only it may touch Node.
 */

import type { Issue } from "../errors.ts";
import type { StoreContents } from "../store/memory.ts";

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
  throw new Error("not implemented");
}
