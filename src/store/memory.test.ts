/**
 * The in-memory store: lookups by key and id, usage reads by company and start time, and
 * copies on read so callers can't change stored state.
 */

import { describe, expect, it } from "vitest";
import {
  makeCompany,
  makeEmployee,
  makeRecord,
  makeTier,
  NOW,
} from "../../tests/helpers/fixtures.ts";
import { createMemoryStore } from "./memory.ts";

const MONDAY = new Date("2026-11-16T00:00:00.000Z");

function seededStore() {
  return createMemoryStore({
    company: makeCompany(),
    tiers: [makeTier()],
    employees: [makeEmployee()],
    usage: [
      makeRecord({ id: "old", startedAt: new Date("2026-11-15T12:00:00.000Z") }),
      makeRecord({ id: "monday", startedAt: MONDAY }),
      makeRecord({ id: "other-company", companyId: "globex" }),
    ],
  });
}

describe("createMemoryStore", () => {
  it("returns the company", async () => {
    expect(await seededStore().getCompany()).toEqual(makeCompany());
  });

  it("finds an employee by key, and nothing for an unknown key", async () => {
    const store = seededStore();
    expect(await store.findEmployeeByKey("key-ada")).toEqual(makeEmployee());
    expect(await store.findEmployeeByKey("key-nobody")).toBeUndefined();
  });

  it("finds a tier by id, and nothing for an unknown id", async () => {
    const store = seededStore();
    expect(await store.getTier("engineer")).toEqual(makeTier());
    expect(await store.getTier("ghost")).toBeUndefined();
  });

  it("lists the company's usage at or after `since`, oldest first", async () => {
    const ids = (await seededStore().listUsageSince("acme", MONDAY)).map((record) => record.id);
    expect(ids).toEqual(["monday"]);
  });

  it("includes an added record in later reads", async () => {
    const store = seededStore();
    await store.addUsage(makeRecord({ id: "new", startedAt: NOW }));
    const ids = (await store.listUsageSince("acme", MONDAY)).map((record) => record.id);
    expect(ids).toEqual(["monday", "new"]);
  });

  it("hands out copies, so changing a returned object doesn't change the store", async () => {
    const store = seededStore();
    const employee = await store.findEmployeeByKey("key-ada");
    if (!employee) throw new Error("seeded employee missing");
    employee.disabled = true;
    employee.overrides.dailyAllowanceMicros = 1;
    expect(await store.findEmployeeByKey("key-ada")).toEqual(makeEmployee());

    const [record] = await store.listUsageSince("acme", MONDAY);
    if (!record) throw new Error("seeded record missing");
    record.costMicros = 999;
    record.startedAt.setUTCFullYear(2000);
    const [again] = await store.listUsageSince("acme", MONDAY);
    expect(again).toMatchObject({ costMicros: 0, startedAt: MONDAY });
  });
});
