/**
 * Percent-of-pool allowances end to end: a tier whose daily allowance is a share of the weekly
 * pool, resolved on every request, so an admin's pool change moves it with no other edit.
 */

import { describe, expect, it } from "vitest";
import { AnthropicErrorBody } from "../src/gateway/anthropic-errors.ts";
import { createMemoryStore } from "../src/store/memory.ts";
import { ADMIN_KEY, demoContents, jsonBody, testApp, testGateway } from "./helpers/app.ts";
import { makeEmployee, makeTier } from "./helpers/fixtures.ts";

const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};
// $0.011 per request with the demo prices.
const costly = { "x-fake-output-tokens": "10000" };

/** The demo company ($1 pool) plus Cal, on a tier allowed 1% of the pool a day. */
function contractorApp() {
  const contents = demoContents();
  contents.tiers.push(
    makeTier({
      id: "contractor",
      name: "Contractor",
      dailyAllowance: { kind: "percentOfPool", basisPoints: 100 },
      overflow: { kind: "block" },
    }),
  );
  contents.employees.push(
    makeEmployee({ id: "cal", name: "Cal", tierId: "contractor", apiKey: "key-contractor" }),
  );
  return testApp({ gateway: testGateway({ store: createMemoryStore(contents) }) }).app;
}

type App = ReturnType<typeof contractorApp>;

const send = (app: App) =>
  app.request("/v1/messages", jsonBody(message, { "x-api-key": "key-contractor", ...costly }));

const asAdmin = (app: App, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { "x-admin-key": ADMIN_KEY, "content-type": "application/json" },
  });

describe("percent-of-pool allowances", () => {
  it("blocks at the employee's share of the pool, reporting it as the limit", async () => {
    const app = contractorApp();
    expect((await send(app)).status).toBe(200);
    const res = await send(app);
    expect(res.status).toBe(429);
    expect(AnthropicErrorBody.parse(await res.json()).error.budget).toMatchObject({
      reason: "personal_allowance_exhausted",
      spentMicros: 11_000,
      limitMicros: 10_000,
    });
  });

  it("follows the pool when an admin raises it, with no change to the tier", async () => {
    const app = contractorApp();
    expect((await send(app)).status).toBe(200);
    expect((await send(app)).status).toBe(429);

    const raised = await asAdmin(app, "/admin/company/pool", {
      method: "PUT",
      body: JSON.stringify({ weeklyPoolUsd: 3 }),
    });
    expect(raised.status).toBe(200);

    expect((await send(app)).status).toBe(200);
    const report = await (await asAdmin(app, "/admin/usage")).json();
    const cal = report.employees.find((row: { employeeId: string }) => row.employeeId === "cal");
    expect(cal).toMatchObject({ dailyAllowanceMicros: 30_000, spentTodayMicros: 22_000 });
  });
});
