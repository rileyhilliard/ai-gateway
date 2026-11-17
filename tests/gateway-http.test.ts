/**
 * POST /v1/messages end to end through the real app: key check, model check, the budget
 * decision with its spill and block outcomes, forwarding, and the usage records written. The
 * store, budget rules and fake upstream are all real; only OpenRouter is replaced, at the
 * Upstream interface, where a test needs to see what was forwarded.
 */

import { describe, expect, it } from "vitest";
import { UpstreamUnavailableError } from "../src/errors.ts";
import { AnthropicErrorBody } from "../src/gateway/anthropic-errors.ts";
import { createMemoryStore } from "../src/store/memory.ts";
import { createOpenRouterUpstream } from "../src/upstream/openrouter.ts";
import type { Upstream, UpstreamRequest } from "../src/upstream/types.ts";
import { demoContents, jsonBody, testApp, testGateway } from "./helpers/app.ts";
import { makeEmployee, makeRecord, NOW, usd } from "./helpers/fixtures.ts";

const TOMORROW = "2026-11-19T00:00:00.000Z";
const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};
// 1,000 input + 10,000 output tokens at $1 per million: $0.011, just over a $0.01 allowance.
const costly = { "x-fake-output-tokens": "10000" };

const post = (
  app: ReturnType<typeof testApp>["app"],
  key: string | null,
  headers = {},
  body: unknown = message,
) =>
  app.request("/v1/messages", jsonBody(body, { ...(key ? { "x-api-key": key } : {}), ...headers }));

const recordsOf = (gateway: ReturnType<typeof testGateway>) =>
  gateway.store.listUsageSince("acme", new Date(0));

/** The `error` object of a gateway error, which must be in Anthropic's shape. */
async function errorOf(res: Response) {
  return AnthropicErrorBody.parse(await res.json()).error;
}

/** An OpenRouter stand-in that remembers what it was sent and answers with a fixed response. */
function recordingUpstream(costMicros: number | null = null) {
  const sent: UpstreamRequest[] = [];
  const send: Upstream["send"] = async (request) => {
    sent.push(request);
    return {
      status: 200,
      body: { type: "message", content: [{ type: "text", text: "Real-ish reply." }] },
      usage: { inputTokens: 10, outputTokens: 20 },
      costMicros,
    };
  };
  const upstream: Upstream = { send, stream: send };
  return { upstream, sent };
}

describe("allowed requests", () => {
  it("passes the upstream's 200 body through and records the cost against personal", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      type: "message",
      content: [{ type: "text", text: "Fake reply." }],
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    expect(await recordsOf(gateway)).toEqual([
      {
        id: "gen-1",
        companyId: "acme",
        employeeId: "sam",
        model: "fake/model",
        status: "allowed",
        bucket: "personal",
        blockReason: null,
        inputTokens: 1000,
        outputTokens: 500,
        costMicros: 1500,
        startedAt: NOW,
        projectTag: null,
      },
    ]);
  });

  it("forwards the whole body and the client's headers, but never the employee's key", async () => {
    const { upstream, sent } = recordingUpstream();
    const { app } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    const body = { ...message, model: "deepseek/deepseek-v4.1-flash-1017", system: "Be brief." };
    const res = await post(app, "key-staff", { "anthropic-version": "2023-06-01" }, body);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual(body);
    expect(sent[0]?.headers).toMatchObject({ "anthropic-version": "2023-06-01" });
    expect(sent[0]?.headers).not.toHaveProperty("x-api-key");
  });

  it("records the provider's reported cost when it sends one, instead of the price table's", async () => {
    const { upstream } = recordingUpstream(77);
    const { app, gateway } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    await post(app, "key-staff", {}, { ...message, model: "deepseek/deepseek-v4.1-flash-1017" });
    expect(await recordsOf(gateway)).toMatchObject([
      {
        model: "deepseek/deepseek-v4.1-flash-1017",
        inputTokens: 10,
        outputTokens: 20,
        costMicros: 77,
      },
    ]);
  });
});

describe("key check (rule 1)", () => {
  it.each([
    ["a missing key", null],
    ["an unknown key", "key-nobody"],
    ["a disabled employee's key", "key-disabled"],
  ])("rejects %s with the 401 envelope and records nothing", async (_, key) => {
    const { app, gateway } = testApp();
    const res = await post(app, key);
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toMatchObject({
      code: "unauthorized",
      message: "Missing or invalid API key. Send your gateway key in the x-api-key header.",
    });
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("checks the key before the body, so a bad key with a bad body is still a 401", async () => {
    const { app } = testApp();
    const res = await post(app, "key-nobody", {}, { messages: [] });
    expect(res.status).toBe(401);
  });
});

describe("model check (rule 2)", () => {
  it("rejects a body without a model with the 400 envelope naming json.model", async () => {
    const { app } = testApp();
    const res = await post(app, "key-staff", {}, { messages: [] });
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("bad_request");
    expect(error.issues?.map((issue) => issue.path)).toContain("json.model");
  });

  it("rejects a model without a price, records nothing and never calls the upstream", async () => {
    const { upstream, sent } = recordingUpstream();
    const { app, gateway } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    const res = await post(app, "key-staff", {}, { ...message, model: "openai/gpt-unknown" });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      code: "unknown_model",
      message:
        'Model "openai/gpt-unknown" isn\'t available through the gateway. Use one of: fake/model, deepseek/deepseek-v4.1-flash-1017, anthropic/claude-sonnet-5.5.',
    });
    expect(sent).toHaveLength(0);
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("rejects fake/ models as unknown when the fake upstream is off (FAKE_UPSTREAM=0)", async () => {
    const { app, gateway } = testApp({ gateway: testGateway({ fakeUpstream: false }) });
    const res = await post(app, "key-staff", costly);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      code: "unknown_model",
      message:
        'Model "fake/model" isn\'t available through the gateway. Use one of: deepseek/deepseek-v4.1-flash-1017, anthropic/claude-sonnet-5.5.',
    });
    expect(await recordsOf(gateway)).toEqual([]);
  });
});

describe("budget outcomes", () => {
  it("blocks an intern after the daily allowance with a 429 saying why and when it resets", async () => {
    const { app, gateway } = testApp();
    expect((await post(app, "key-intern", costly)).status).toBe(200);

    const res = await post(app, "key-intern", costly);
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toMatchObject({
      type: "rate_limit_error",
      code: "budget_exceeded",
      message: `Daily allowance of $0.01 used. Resets ${TOMORROW}.`,
      budget: {
        reason: "personal_allowance_exhausted",
        spentMicros: 11_000,
        limitMicros: 10_000,
        resetsAt: TOMORROW,
      },
    });
    expect((await recordsOf(gateway))[1]).toMatchObject({
      status: "blocked",
      bucket: null,
      blockReason: "personal_allowance_exhausted",
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    });
  });

  it("spills an engineer to the pool after the allowance, then blocks at the pool cap", async () => {
    const { app, gateway } = testApp();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(app, "key-engineer", costly)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const records = await recordsOf(gateway);
    expect(records.map((record) => record.bucket ?? record.blockReason)).toEqual([
      "personal",
      "pool",
      "pool",
      "pool_cap_reached",
    ]);
  });

  it("blocks everyone once the company pool is spent, even with allowance left", async () => {
    const contents = demoContents();
    contents.usage = [makeRecord({ employeeId: "ivy", costMicros: usd(1) })];
    const gateway = testGateway({ store: createMemoryStore(contents) });
    const { app } = testApp({ gateway });
    const res = await post(app, "key-staff");
    expect(res.status).toBe(429);
    expect((await errorOf(res)).budget).toMatchObject({
      reason: "company_pool_exhausted",
      resetsAt: "2026-11-23T00:00:00.000Z",
    });
  });

  it("allows concurrent requests that each passed the check, overshooting the allowance", async () => {
    const { app, gateway } = testApp();
    const slow = { ...costly, "x-fake-delay-ms": "50" };
    const [first, second] = await Promise.all([
      post(app, "key-intern", slow),
      post(app, "key-intern", slow),
    ]);
    expect([first?.status, second?.status]).toEqual([200, 200]);
    const spent = (await recordsOf(gateway)).reduce((sum, record) => sum + record.costMicros, 0);
    expect(spent).toBe(22_000);
  });
});

describe("upstream failures", () => {
  it("passes an upstream error through and records nothing when it reports no usage", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-fake-status": "529" });
    expect(res.status).toBe(529);
    expect(await res.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "Fake upstream error." },
    });
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("charges an upstream error that reports usage", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-fake-status": "500", "x-fake-usage": "report" });
    expect(res.status).toBe(500);
    expect(await recordsOf(gateway)).toMatchObject([
      { status: "allowed", bucket: "personal", costMicros: 1500 },
    ]);
  });

  it("answers 502 when the upstream can't be reached, and charges nothing", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-fake-unreachable": "1" });
    expect(res.status).toBe(502);
    expect((await errorOf(res)).code).toBe("upstream_unavailable");
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("logs why the upstream couldn't be reached, once, as a warning", async () => {
    const fail = async (): Promise<never> => {
      throw new UpstreamUnavailableError(new TypeError("fetch failed"));
    };
    const failing: Upstream = { send: fail, stream: fail };
    const { app, records } = testApp({ gateway: testGateway({ openrouter: failing }) });
    const res = await post(
      app,
      "key-staff",
      {},
      { ...message, model: "deepseek/deepseek-v4.1-flash-1017" },
    );
    const requestId = res.headers.get("x-request-id");
    const logged = records.filter((record) => record.msg === "upstream unavailable");
    expect(logged).toEqual([
      expect.objectContaining({
        level: "warn",
        requestId,
        cause: { errorClass: "TypeError", message: "fetch failed" },
      }),
    ]);
  });
});

describe("OpenRouter answers about the company account", () => {
  const realModel = { ...message, model: "deepseek/deepseek-v4.1-flash-1017" };
  /** The real OpenRouter upstream over a fetch that always answers `response`. */
  const openRouterAnswering = (response: Response) =>
    createOpenRouterUpstream({ apiKey: "sk-or-test", fetch: async () => response });

  it("gives the employee a 502, not a 401 about their key, when the company key is rejected", async () => {
    const openrouter = openRouterAnswering(
      new Response(JSON.stringify({ error: { code: 401, message: "User not found." } }), {
        status: 401,
      }),
    );
    const { app, gateway, records } = testApp({ gateway: testGateway({ openrouter }) });
    const res = await post(app, "key-staff", {}, realModel);
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toMatchObject({ type: "api_error", code: "upstream_unavailable" });
    expect(records.filter((record) => record.msg === "upstream unavailable")).toEqual([
      expect.objectContaining({
        level: "warn",
        cause: {
          errorClass: "Error",
          message: "OpenRouter rejected the company key (401); check OPENROUTER_KEY.",
        },
      }),
    ]);
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("passes OpenRouter's retry-after through on a 429", async () => {
    const openrouter = openRouterAnswering(
      new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    );
    const { app } = testApp({ gateway: testGateway({ openrouter }) });
    const res = await post(app, "key-staff", {}, realModel);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });
});

describe("fake upstream headers", () => {
  const TOKENS = "must be a whole number from 0 to 10000000.";
  it.each([
    ["x-fake-input-tokens", "-100000000", TOKENS],
    ["x-fake-output-tokens", "Infinity", TOKENS],
    ["x-fake-output-tokens", "lots", TOKENS],
    ["x-fake-input-tokens", "1.5", TOKENS],
    ["x-fake-input-tokens", "10000001", TOKENS],
    ["x-fake-status", "999", "must be 200, or a whole number from 400 to 599."],
    ["x-fake-status", "204", "must be 200, or a whole number from 400 to 599."],
    ["x-fake-status", "error", "must be 200, or a whole number from 400 to 599."],
    ["x-fake-delay-ms", "10001", "must be a whole number from 0 to 10000."],
    ["x-fake-delay-ms", "-1", "must be a whole number from 0 to 10000."],
    ["x-fake-drop-after", "-1", "must be a whole number from 0 to 1000."],
  ])(
    "reject %s: %s with a 400 naming the allowed range, recording nothing",
    async (name, value, rule) => {
      const { app, gateway } = testApp();
      const res = await post(app, "key-staff", { [name]: value });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toMatchObject({
        code: "bad_request",
        issues: [{ path: `header.${name}`, message: `${name} ${rule}` }],
      });
      expect(await recordsOf(gateway)).toEqual([]);
    },
  );

  it("checks the headers before the budget decision, so a blocked employee gets the 400", async () => {
    const { app, gateway } = testApp();
    await post(app, "key-intern", costly);
    const res = await post(app, "key-intern", { "x-fake-input-tokens": "-1" });
    expect(res.status).toBe(400);
    expect(await recordsOf(gateway)).toHaveLength(1);
  });

  it("checks them on a streaming request too", async () => {
    const { app } = testApp();
    const res = await post(
      app,
      "key-staff",
      { "x-fake-output-tokens": "-1" },
      {
        ...message,
        stream: true,
      },
    );
    expect(res.status).toBe(400);
  });

  it("lists every bad header at once", async () => {
    const { app } = testApp();
    const res = await post(app, "key-staff", {
      "x-fake-input-tokens": "-1",
      "x-fake-status": "999",
    });
    expect((await errorOf(res)).issues?.map((issue) => issue.path)).toEqual([
      "header.x-fake-input-tokens",
      "header.x-fake-status",
    ]);
  });

  it("accepts the edges of each range", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", {
      "x-fake-input-tokens": "0",
      "x-fake-output-tokens": "10000000",
      "x-fake-delay-ms": "0",
    });
    expect(res.status).toBe(200);
    expect(await recordsOf(gateway)).toMatchObject([{ inputTokens: 0, outputTokens: 10_000_000 }]);
    // A fresh app, since $10 of output tokens just emptied the first one's pool.
    const fresh = testApp().app;
    expect((await post(fresh, "key-staff", { "x-fake-status": "599" })).status).toBe(599);
  });
});

describe("project tag", () => {
  it("records the x-project header on the usage record", async () => {
    const { app, gateway } = testApp();
    await post(app, "key-staff", { "x-project": " apollo " });
    expect(await recordsOf(gateway)).toMatchObject([{ projectTag: "apollo" }]);
  });

  it("records a blocked request's project too", async () => {
    const { app, gateway } = testApp();
    await post(app, "key-intern", costly);
    await post(app, "key-intern", { ...costly, "x-project": "apollo" });
    expect((await recordsOf(gateway))[1]).toMatchObject({
      status: "blocked",
      projectTag: "apollo",
    });
  });

  it("records no project when the header is missing or blank", async () => {
    const { app, gateway } = testApp();
    await post(app, "key-staff");
    await post(app, "key-staff", { "x-project": "   " });
    const tags = (await recordsOf(gateway)).map((record) => record.projectTag);
    expect(tags).toEqual([null, null]);
  });

  it("rejects a tag over 64 characters with a 400 naming the header, and records nothing", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-project": "p".repeat(65) });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      code: "bad_request",
      issues: [
        {
          path: "header.x-project",
          message: "Project tag is 65 characters; the limit is 64. Use a shorter name.",
        },
      ],
    });
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("doesn't forward x-project to the provider", async () => {
    const { upstream, sent } = recordingUpstream();
    const { app } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    const body = { ...message, model: "deepseek/deepseek-v4.1-flash-1017" };
    await post(app, "key-staff", { "x-project": "apollo" }, body);
    expect(sent[0]?.headers).not.toHaveProperty("x-project");
  });
});

describe("misconfiguration", () => {
  it("answers 500 when an employee's tier doesn't exist", async () => {
    const contents = demoContents();
    contents.employees.push(makeEmployee({ id: "gus", tierId: "ghost", apiKey: "key-ghost" }));
    const { app } = testApp({ gateway: testGateway({ store: createMemoryStore(contents) }) });
    const res = await post(app, "key-ghost");
    expect(res.status).toBe(500);
    expect((await errorOf(res)).code).toBe("internal");
  });
});
