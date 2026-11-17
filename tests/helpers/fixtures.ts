/**
 * Builders for budget domain values with readable defaults, so each test states only the
 * fields its behavior depends on. Money is in micro-dollars: $0.50 is 500_000.
 */

import type { Company, Employee, Tier, UsageRecord } from "../../src/budget/types.ts";

/** Wednesday 2026-11-18 at noon UTC. The week started Monday 2026-11-16. */
export const NOW = new Date("2026-11-18T12:00:00.000Z");

export const usd = (dollars: number): number => Math.round(dollars * 1_000_000);

export function makeCompany(fields: Partial<Company> = {}): Company {
  return { id: "acme", name: "Acme", weeklyPoolMicros: usd(10), ...fields };
}

export function makeTier(fields: Partial<Tier> = {}): Tier {
  return {
    id: "engineer",
    name: "Engineer",
    dailyAllowanceMicros: usd(0.5),
    overflow: { kind: "pool", weeklyCapMicros: usd(2) },
    ...fields,
  };
}

export function makeEmployee(fields: Partial<Employee> = {}): Employee {
  return {
    id: "ada",
    companyId: "acme",
    name: "Ada",
    tierId: "engineer",
    overrides: {},
    apiKey: "key-ada",
    disabled: false,
    ...fields,
  };
}

let recordCount = 0;

/** An allowed, personal-bucket record for Ada at NOW, unless told otherwise. */
export function makeRecord(fields: Partial<UsageRecord> = {}): UsageRecord {
  recordCount += 1;
  return {
    id: `rec-${recordCount}`,
    companyId: "acme",
    employeeId: "ada",
    model: "fake/model",
    status: "allowed",
    bucket: "personal",
    blockReason: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    startedAt: NOW,
    projectTag: null,
    ...fields,
  };
}
