/**
 * The in-memory Store: the only module that holds state. Contents are lost on restart.
 */

import type { Company, Employee, Tier, UsageRecord } from "../budget/types.ts";
import type { Store } from "./types.ts";

/** What a store starts with. The seed loader produces this shape. */
export type StoreContents = {
  company: Company;
  tiers: Tier[];
  employees: Employee[];
  usage?: UsageRecord[];
};

/** A Store holding `contents` in memory. Reads return copies, so callers can't change state. */
export function createMemoryStore(contents: StoreContents): Store {
  throw new Error("not implemented");
}
