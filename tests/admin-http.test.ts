/**
 * The admin usage view over HTTP: GET /admin/usage behind the admin key, its numbers after real
 * gateway traffic, and the GET /admin page that renders it. Everything is real except the clock.
 */

import { describe, expect, it } from "vitest";
import { ErrorEnvelope } from "../src/errors.ts";
import { ADMIN_KEY, jsonBody, testApp } from "./helpers/app.ts";

type App = ReturnType<typeof testApp>["app"];

const costly = { "x-fake-output-tokens": "10000" };
const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};

const getUsage = (app: App, key: string | null = ADMIN_KEY) =>
  app.request("/admin/usage", { headers: key === null ? {} : { "x-admin-key": key } });

const send = (app: App, apiKey: string) =>
  app.request("/v1/messages", jsonBody(message, { "x-api-key": apiKey, ...costly }));

describe("admin key", () => {
  it.each([
    ["no admin key", null],
    ["an empty admin key", ""],
    ["a wrong admin key", "nope"],
    ["an employee's gateway key", "key-staff"],
    ["the admin key with its last character changed", `${ADMIN_KEY.slice(0, -1)}X`],
    ["a prefix of the admin key", ADMIN_KEY.slice(0, -1)],
    ["the admin key with extra characters", `${ADMIN_KEY}x`],
  ])("rejects %s with the 401 envelope", async (_, key) => {
    const { app } = testApp();
    const res = await getUsage(app, key);
    expect(res.status).toBe(401);
    expect(ErrorEnvelope.parse(await res.json()).error).toMatchObject({
      code: "unauthorized",
      message: "Missing or invalid admin key. Send it in the x-admin-key header.",
    });
  });

  it("rejects every request when ADMIN_KEY isn't configured, even one with no key", async () => {
    const { app } = testApp({ adminKey: null });
    expect((await getUsage(app, null)).status).toBe(401);
    expect((await getUsage(app, "")).status).toBe(401);
    expect((await getUsage(app, "undefined")).status).toBe(401);
  });

  it("never treats an empty configured key as a match for an empty header", async () => {
    const { app } = testApp({ adminKey: "" });
    expect((await getUsage(app, "")).status).toBe(401);
  });
});

describe("GET /admin/usage", () => {
  it("lists every seeded employee at zero before any traffic", async () => {
    const { app } = testApp();
    const res = await getUsage(app);
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report).toMatchObject({
      asOf: "2026-11-18T12:00:00.000Z",
      dayResetsAt: "2026-11-19T00:00:00.000Z",
      weekResetsAt: "2026-11-23T00:00:00.000Z",
      company: { id: "acme", name: "Acme", spentThisWeekMicros: 0, weeklyPoolMicros: 1_000_000 },
    });
    expect(report.employees.map((row: { employeeId: string }) => row.employeeId)).toEqual([
      "ivy",
      "eli",
      "sam",
      "dee",
    ]);
  });

  it("matches what the gateway allowed, spilled and blocked", async () => {
    const { app } = testApp();
    // Eli: personal, pool, pool, then blocked at the $0.02 cap. Ivy: allowed, then blocked.
    for (let i = 0; i < 4; i++) await send(app, "key-engineer");
    for (let i = 0; i < 2; i++) await send(app, "key-intern");

    const report = await (await getUsage(app)).json();
    expect(report.company.spentThisWeekMicros).toBe(4 * 11_000);
    const [ivy, eli, sam] = report.employees;
    expect(eli).toEqual({
      employeeId: "eli",
      name: "Eli",
      tierId: "engineer",
      disabled: false,
      spentTodayMicros: 11_000,
      dailyAllowanceMicros: 10_000,
      overflow: { kind: "pool", weeklyCapMicros: 20_000 },
      poolDrawsThisWeekMicros: 22_000,
      spentThisWeekMicros: 33_000,
      blockedThisWeek: 1,
    });
    expect(ivy).toMatchObject({
      spentTodayMicros: 11_000,
      overflow: { kind: "block" },
      poolDrawsThisWeekMicros: 0,
      blockedThisWeek: 1,
    });
    expect(sam).toMatchObject({ spentTodayMicros: 0, blockedThisWeek: 0 });
  });

  it("isn't itself recorded as usage", async () => {
    const { app } = testApp();
    await getUsage(app);
    await getUsage(app);
    const report = await (await getUsage(app)).json();
    expect(report.company.spentThisWeekMicros).toBe(0);
  });

  it("GET /admin/usage reports spend per project from tagged gateway requests", async () => {
    const { app } = testApp();
    const sendFor = (apiKey: string, project?: string) =>
      app.request(
        "/v1/messages",
        jsonBody(message, {
          "x-api-key": apiKey,
          ...costly,
          ...(project === undefined ? {} : { "x-project": project }),
        }),
      );
    // Sam's uncapped pool allows everything; Ivy's second request is blocked by her allowance.
    await sendFor("key-staff", "apollo");
    await sendFor("key-staff", " apollo ");
    await sendFor("key-staff");
    await sendFor("key-intern", "apollo");
    await sendFor("key-intern", "apollo");

    const report = await (await getUsage(app)).json();
    expect(report.projects).toEqual([
      { projectTag: "apollo", spentThisWeekMicros: 3 * 11_000, requests: 3, blockedRequests: 1 },
      { projectTag: null, spentThisWeekMicros: 11_000, requests: 1, blockedRequests: 0 },
    ]);
  });

  it("documents the projects field in the OpenAPI usage schema", async () => {
    const { app } = testApp();
    const doc = await (await app.request("/openapi.json")).json();
    expect(doc.components.schemas.UsageReport.properties.projects).toMatchObject({
      type: "array",
    });
  });
});

describe("GET /admin", () => {
  it("serves an HTML page that loads the usage JSON, without embedding any data", async () => {
    const { app } = testApp();
    await send(app, "key-engineer");
    const res = await app.request("/admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const page = await res.text();
    expect(page).toContain("<title>");
    expect(page).toContain("/admin/usage");
    expect(page).toContain("x-admin-key");
    // Data only arrives through the keyed JSON request, so the page itself is safe to serve.
    expect(page).not.toContain("Eli");
    expect(page).not.toContain(ADMIN_KEY);
  });

  it("has a projects table that renders the report's project rows", async () => {
    const { app } = testApp();
    const page = await (await app.request("/admin")).text();
    expect(page).toContain('id="projectRows"');
    expect(page).toContain("report.projects");
    expect(page).toContain("(no project)");
  });
});
