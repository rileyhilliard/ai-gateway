/**
 * The persistence contract the gateway reads and writes through. v1 has an in-memory
 * implementation; a database-backed one can replace it without touching callers.
 */

import type { Company, Employee, Tier, UsageRecord } from "../budget/types.ts";

/** Company, tier, employee and usage data for the one seeded company. */
export interface Store {
  /** The seeded company. */
  getCompany(): Promise<Company>;
  /** The tier with this id, or undefined. */
  getTier(id: string): Promise<Tier | undefined>;
  /** Every tier, in seed order. */
  listTiers(): Promise<Tier[]>;
  /** Every employee, disabled ones included, in seed order. */
  listEmployees(): Promise<Employee[]>;
  /** The employee whose active key this is, or undefined. Disabled employees are returned too. */
  findEmployeeByKey(apiKey: string): Promise<Employee | undefined>;
  /** The company's usage records with `startedAt` at or after `since`, oldest first. */
  listUsageSince(companyId: string, since: Date): Promise<UsageRecord[]>;
  /** Appends one usage record. */
  addUsage(record: UsageRecord): Promise<void>;
}
