/**
 * The persistence contract the gateway reads and writes through. v1 has an in-memory
 * implementation; a database-backed one can replace it without touching callers.
 */

import type { Company, Employee, Tier, UsageRecord } from "../budget/types.ts";

/** The employee fields an admin can change. Omitted fields stay as they are. */
export type EmployeeChanges = Partial<
  Pick<Employee, "tierId" | "overrides" | "apiKey" | "disabled">
>;

/** Company, tier, employee and usage data for the one seeded company. */
export interface Store {
  /** The seeded company. */
  getCompany(): Promise<Company>;
  /** The tier with this id, or undefined. */
  getTier(id: string): Promise<Tier | undefined>;
  /** Every tier, in seed order. */
  listTiers(): Promise<Tier[]>;
  /** Sets the company's weekly pool and returns the updated company. */
  setWeeklyPool(weeklyPoolMicros: number): Promise<Company>;
  /** The employee with this id, or undefined. */
  getEmployee(id: string): Promise<Employee | undefined>;
  /** Applies `changes` to the employee and returns it, or undefined when no employee has this id. */
  updateEmployee(id: string, changes: EmployeeChanges): Promise<Employee | undefined>;
  /** Every employee, disabled ones included, in seed order. */
  listEmployees(): Promise<Employee[]>;
  /** The employee whose active key this is, or undefined. Disabled employees are returned too. */
  findEmployeeByKey(apiKey: string): Promise<Employee | undefined>;
  /** The company's usage records with `startedAt` at or after `since`, oldest first. */
  listUsageSince(companyId: string, since: Date): Promise<UsageRecord[]>;
  /** Appends one usage record. */
  addUsage(record: UsageRecord): Promise<void>;
}
