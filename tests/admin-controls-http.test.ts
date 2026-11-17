/**
 * The admin write API and the demo clock over HTTP. Each test changes something through the
 * admin API and then shows the next gateway request change outcome, since that's the behavior an
 * admin cares about. Inputs are dollars; responses are micro-dollars.
 */

import { describe, expect, it } from "vitest";
import { ErrorEnvelope } from "../src/errors.ts";
import { ADMIN_KEY, jsonBody, testApp, testGateway } from "./helpers/app.ts";

type App = ReturnType<typeof testApp>["app"];

const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};
// $0.011 per request: one of these uses up a $0.01 allowance.
const costly = { "x-fake-output-tokens": "10000" };

const send = (app: App, apiKey: string) =>
  app.request("/v1/messages", jsonBody(message, { "x-api-key": apiKey, ...costly }));

/** A request helper that sends `key` as the admin key. */
const asAdmin = (key: string) => (app: App, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      "x-admin-key": key,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const admin = asAdmin(ADMIN_KEY);

async function errorOf(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error;
}

async function blockReasonOf(res: Response) {
  return (await errorOf(res)).budget?.reason;
}

describe("admin key", () => {
  it.each([
    ["PUT", "/admin/company/pool", { weeklyPoolUsd: 0 }],
    ["PUT", "/admin/employees/ivy/tier", { tierId: "staff" }],
    ["PUT", "/admin/employees/ivy/overrides", { dailyAllowanceUsd: 0 }],
    ["DELETE", "/admin/employees/ivy/key", undefined],
    ["POST", "/admin/employees/ivy/key", undefined],
  ])("rejects %s %s without the admin key and changes nothing", async (method, path, body) => {
    const { app } = testApp();
    const before = await (await admin(app, "GET", "/admin/usage")).json();
    const res = await asAdmin("wrong-key")(app, method, path, body);
    expect(res.status).toBe(401);
    // Every body above would show in the usage view (pool, tier, allowance, disabled) if applied.
    expect(await (await admin(app, "GET", "/admin/usage")).json()).toEqual(before);
    expect((await send(app, "key-intern")).status).toBe(200);
  });
});

describe("company pool", () => {
  it("sets the pool in dollars and answers in micro-dollars", async () => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/company/pool", { weeklyPoolUsd: 2.5 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "acme", name: "Acme", weeklyPoolMicros: 2_500_000 });
  });

  it("blocks everyone on the next request once the pool is lowered below this week's spend", async () => {
    const { app } = testApp();
    expect((await send(app, "key-staff")).status).toBe(200);
    await admin(app, "PUT", "/admin/company/pool", { weeklyPoolUsd: 0.01 });
    const res = await send(app, "key-staff");
    expect(res.status).toBe(429);
    expect(await blockReasonOf(res)).toBe("company_pool_exhausted");
  });

  it("accepts a $0 pool, which blocks every request", async () => {
    const { app } = testApp();
    expect((await admin(app, "PUT", "/admin/company/pool", { weeklyPoolUsd: 0 })).status).toBe(200);
    expect(await blockReasonOf(await send(app, "key-staff"))).toBe("company_pool_exhausted");
  });

  it.each([
    ["a negative pool", { weeklyPoolUsd: -1 }],
    ["a missing pool", {}],
    ["a pool that isn't a number", { weeklyPoolUsd: "5" }],
    ["a pool over $1,000,000", { weeklyPoolUsd: 1e12 }],
  ])("rejects %s with the 400 envelope naming the field", async (_, body) => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/company/pool", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues?.map((issue) => issue.path)).toContain("json.weeklyPoolUsd");
  });
});

describe("moving an employee to another tier", () => {
  it("applies the new tier on the next request, keeping today's spend", async () => {
    const { app } = testApp();
    await send(app, "key-intern");
    expect((await send(app, "key-intern")).status).toBe(429);

    const res = await admin(app, "PUT", "/admin/employees/ivy/tier", { tierId: "engineer" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "ivy",
      name: "Ivy",
      tierId: "engineer",
      disabled: false,
      overrides: {},
    });
    // Ivy's $0.011 today still counts, so as an engineer she spills to the pool.
    expect((await send(app, "key-intern")).status).toBe(200);
  });

  it("rejects a tier that doesn't exist with the 400 envelope naming tierId", async () => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/employees/ivy/tier", { tierId: "ghost" });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues?.map((issue) => issue.path)).toContain("json.tierId");
  });

  it("answers 404 for an employee that doesn't exist", async () => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/employees/nobody/tier", { tierId: "staff" });
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("not_found");
  });
});

describe("overrides", () => {
  it("raises one employee's allowance without changing their tier", async () => {
    const { app } = testApp();
    await send(app, "key-intern");
    const res = await admin(app, "PUT", "/admin/employees/ivy/overrides", { dailyAllowanceUsd: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      tierId: "intern",
      overrides: { dailyAllowanceMicros: 1_000_000 },
    });
    expect((await send(app, "key-intern")).status).toBe(200);
    expect((await send(app, "key-engineer")).status).toBe(200);
  });

  it("uncaps an engineer's pool draws with a null cap", async () => {
    const { app } = testApp();
    await admin(app, "PUT", "/admin/employees/eli/overrides", { poolCapUsd: null });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await send(app, "key-engineer")).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });

  it("sets a numeric pool cap in dollars, and a $0 cap stops the spill", async () => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/employees/eli/overrides", {
      dailyAllowanceUsd: 0.01,
      poolCapUsd: 0,
    });
    expect(await res.json()).toEqual({
      id: "eli",
      name: "Eli",
      tierId: "engineer",
      disabled: false,
      overrides: { dailyAllowanceMicros: 10_000, poolCapMicros: 0 },
    });
    expect((await send(app, "key-engineer")).status).toBe(200);
    expect(await blockReasonOf(await send(app, "key-engineer"))).toBe("pool_cap_reached");
  });

  it("accepts a $0 allowance, sending every request to the pool or a block", async () => {
    const { app } = testApp();
    await admin(app, "PUT", "/admin/employees/ivy/overrides", { dailyAllowanceUsd: 0 });
    expect(await blockReasonOf(await send(app, "key-intern"))).toBe("personal_allowance_exhausted");
  });

  it("replaces all overrides, so an empty body clears them", async () => {
    const { app } = testApp();
    await admin(app, "PUT", "/admin/employees/ivy/overrides", { dailyAllowanceUsd: 0 });
    const res = await admin(app, "PUT", "/admin/employees/ivy/overrides", {});
    expect(await res.json()).toMatchObject({ overrides: {} });
    expect((await send(app, "key-intern")).status).toBe(200);
  });

  it.each([
    ["a negative allowance", { dailyAllowanceUsd: -0.01 }, "json.dailyAllowanceUsd"],
    ["a negative cap", { poolCapUsd: -1 }, "json.poolCapUsd"],
  ])("rejects %s with the 400 envelope", async (_, body, path) => {
    const { app } = testApp();
    const res = await admin(app, "PUT", "/admin/employees/ivy/overrides", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues?.map((issue) => issue.path)).toContain(path);
  });

  it("answers 404 for an employee that doesn't exist", async () => {
    const { app } = testApp();
    expect((await admin(app, "PUT", "/admin/employees/nobody/overrides", {})).status).toBe(404);
  });
});

describe("revoking and reissuing keys", () => {
  it("revokes a key so the next request gets 401, and keeps the usage history", async () => {
    const { app } = testApp();
    await send(app, "key-staff");
    const res = await admin(app, "DELETE", "/admin/employees/sam/key");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "sam", disabled: true });
    expect((await send(app, "key-staff")).status).toBe(401);

    const usage = await (await admin(app, "GET", "/admin/usage")).json();
    expect(usage.employees[2]).toMatchObject({
      employeeId: "sam",
      disabled: true,
      spentTodayMicros: 11_000,
    });
  });

  it("reissues a key: the new one works, the old one gets 401, and a revoked employee is re-enabled", async () => {
    const { app } = testApp();
    await admin(app, "DELETE", "/admin/employees/sam/key");
    const res = await admin(app, "POST", "/admin/employees/sam/key");
    expect(res.status).toBe(200);
    const { employeeId, apiKey } = await res.json();
    expect(employeeId).toBe("sam");
    expect(apiKey).toMatch(/^key-/);
    expect(apiKey).not.toBe("key-staff");
    expect((await send(app, "key-staff")).status).toBe(401);
    expect((await send(app, apiKey)).status).toBe(200);
  });

  it("never returns an employee's key from anything but a reissue", async () => {
    const { app } = testApp();
    const responses = [
      await admin(app, "PUT", "/admin/employees/sam/tier", { tierId: "engineer" }),
      await admin(app, "PUT", "/admin/employees/sam/overrides", {}),
      await admin(app, "DELETE", "/admin/employees/sam/key"),
    ];
    for (const res of responses) expect(await res.text()).not.toContain("key-staff");
  });

  it.each([
    ["DELETE", "revoke"],
    ["POST", "reissue"],
  ])(
    "answers 404 when asked to %s (%s) a key for an employee that doesn't exist",
    async (method) => {
      const { app } = testApp();
      expect((await admin(app, method, "/admin/employees/nobody/key")).status).toBe(404);
    },
  );
});

describe("demo clock", () => {
  it("is not mounted unless DEMO_CLOCK is on", async () => {
    const { app } = testApp();
    expect((await admin(app, "POST", "/admin/clock/advance", { hours: 1 })).status).toBe(404);
  });

  it("refills the allowance after advancing past 00:00 UTC", async () => {
    const { app } = testApp({ demoClock: true });
    await send(app, "key-intern");
    expect((await send(app, "key-intern")).status).toBe(429);

    // NOW is 12:00 UTC, so 12 hours later is midnight.
    const res = await admin(app, "POST", "/admin/clock/advance", { hours: 12 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ now: "2026-11-19T00:00:00.000Z" });
    expect((await send(app, "key-intern")).status).toBe(200);
  });

  it("refuses to start when the gateway reads a different clock than the demo clock", () => {
    expect(() => testApp({ gateway: testGateway(), demoClock: true })).toThrow(/demoClock/);
  });

  it("requires the admin key", async () => {
    const { app } = testApp({ demoClock: true });
    expect(
      (await asAdmin("wrong-key")(app, "POST", "/admin/clock/advance", { hours: 1 })).status,
    ).toBe(401);
  });

  it.each([
    ["zero hours", { hours: 0 }],
    ["negative hours", { hours: -1 }],
    ["more than two weeks", { hours: 24 * 14 + 1 }],
    ["no hours", {}],
  ])("rejects %s with the 400 envelope", async (_, body) => {
    const { app } = testApp({ demoClock: true });
    const res = await admin(app, "POST", "/admin/clock/advance", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues?.map((issue) => issue.path)).toContain("json.hours");
  });
});
