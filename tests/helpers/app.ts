/**
 * Creates fresh apps for integration tests: a real in-memory store seeded with the demo
 * company, the real fake upstream, a fixed clock, and captured logger records.
 */

import { createApp } from "../../src/app.ts";
import { DEFAULT_PRICES } from "../../src/budget/pricing.ts";
import type { Clock } from "../../src/budget/types.ts";
import { createDemoClock } from "../../src/clock/demo-clock.ts";
import type { GatewayDeps } from "../../src/gateway/service.ts";
import { createLogger } from "../../src/logging.ts";
import { createMemoryStore, type StoreContents } from "../../src/store/memory.ts";
import type { Store } from "../../src/store/types.ts";
import { createFakeUpstream } from "../../src/upstream/fake.ts";
import type { Upstreams } from "../../src/upstream/select.ts";
import type { Upstream } from "../../src/upstream/types.ts";
import { makeCompany, makeEmployee, makeTier, NOW, usd } from "./fixtures.ts";

export type LogRecord = Record<string, unknown> & { level: string; msg: string };

/**
 * The demo company in micro-dollars: a $1 weekly pool; intern ($0.01/day, block), engineer
 * ($0.01/day, pool capped at $0.02/week) and staff ($0.05/day, uncapped pool) tiers; one
 * employee per tier plus a disabled one.
 */
export function demoContents(): StoreContents {
  return {
    company: makeCompany({ weeklyPoolMicros: usd(1) }),
    tiers: [
      makeTier({
        id: "intern",
        name: "Intern",
        dailyAllowance: { kind: "fixed", micros: usd(0.01) },
        overflow: { kind: "block" },
      }),
      makeTier({
        id: "engineer",
        name: "Engineer",
        dailyAllowance: { kind: "fixed", micros: usd(0.01) },
        overflow: { kind: "pool", weeklyCapMicros: usd(0.02) },
      }),
      makeTier({
        id: "staff",
        name: "Staff",
        dailyAllowance: { kind: "fixed", micros: usd(0.05) },
        overflow: { kind: "pool", weeklyCapMicros: null },
      }),
    ],
    employees: [
      makeEmployee({ id: "ivy", name: "Ivy", tierId: "intern", apiKey: "key-intern" }),
      makeEmployee({ id: "eli", name: "Eli", tierId: "engineer", apiKey: "key-engineer" }),
      makeEmployee({ id: "sam", name: "Sam", tierId: "staff", apiKey: "key-staff" }),
      makeEmployee({
        id: "dee",
        name: "Dee",
        tierId: "intern",
        apiKey: "key-disabled",
        disabled: true,
      }),
    ],
  };
}

/** Gateway dependencies for tests. Ids count up from gen-1 so records are easy to assert. */
export function testGateway(
  options: { store?: Store; openrouter?: Upstream; clock?: Clock } = {},
): GatewayDeps {
  let idCount = 0;
  const upstreams: Upstreams = {
    fake: createFakeUpstream(),
    openrouter: options.openrouter ?? createFakeUpstream(),
  };
  return {
    store: options.store ?? createMemoryStore(demoContents()),
    upstreams,
    prices: DEFAULT_PRICES,
    clock: options.clock ?? (() => NOW),
    newId: () => {
      idCount += 1;
      return `gen-${idCount}`;
    },
  };
}

export const ADMIN_KEY = "admin-test";

/**
 * A fresh app with its own store and a logger whose records the test can read. The admin key is
 * ADMIN_KEY unless `adminKey` is passed; `adminKey: null` runs the app with no key configured.
 */
export function testApp(
  options: {
    gateway?: GatewayDeps;
    maxBodyBytes?: number;
    adminKey?: string | null;
    /** Starts a demo clock at NOW and mounts its route; the gateway reads that clock. */
    demoClock?: boolean;
  } = {},
) {
  const demoClock = options.demoClock ? createDemoClock(() => NOW) : undefined;
  const adminKey = options.adminKey === null ? undefined : (options.adminKey ?? ADMIN_KEY);
  const records: LogRecord[] = [];
  const logger = createLogger("debug", {
    write: (line: string) => {
      records.push(JSON.parse(line) as LogRecord);
    },
  });
  const gateway = options.gateway ?? testGateway(demoClock ? { clock: demoClock.now } : {});
  const app = createApp({
    config: {
      maxBodyBytes: options.maxBodyBytes ?? 65_536,
      adminKey,
    },
    logger,
    gateway,
    demoClock,
  });
  const requests = () => records.filter((record) => record.msg === "request");
  return { app, records, requests, gateway };
}

export const jsonBody = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});
