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
  // Copy on the way in as well, so the caller's arrays can't change stored state either.
  let company = structuredClone(contents.company);
  const tiers = structuredClone(contents.tiers);
  const employees = structuredClone(contents.employees);
  const usage = structuredClone(contents.usage ?? []);

  return {
    async getCompany() {
      return structuredClone(company);
    },
    async setWeeklyPool(weeklyPoolMicros) {
      company = { ...company, weeklyPoolMicros };
      return structuredClone(company);
    },
    async getTier(id) {
      return structuredClone(tiers.find((tier) => tier.id === id));
    },
    async listTiers() {
      return structuredClone(tiers);
    },
    async listEmployees() {
      return structuredClone(employees);
    },
    async getEmployee(id) {
      return structuredClone(employees.find((employee) => employee.id === id));
    },
    async updateEmployee(id, changes) {
      const index = employees.findIndex((employee) => employee.id === id);
      const current = employees[index];
      if (!current) return undefined;
      const updated = { ...current, ...structuredClone(changes) };
      employees[index] = updated;
      return structuredClone(updated);
    },
    async findEmployeeByKey(apiKey) {
      return structuredClone(employees.find((employee) => employee.apiKey === apiKey));
    },
    async listUsageSince(companyId, since) {
      const matching = usage.filter(
        (record) => record.companyId === companyId && record.startedAt >= since,
      );
      return structuredClone(matching);
    },
    async addUsage(record) {
      usage.push(structuredClone(record));
    },
  };
}
