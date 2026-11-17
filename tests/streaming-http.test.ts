/**
 * POST /v1/messages with `stream: true` through the real app: the provider's events pass through
 * as they arrive, and one usage record is written when the stream ends, however it ends. The
 * store, budget rules and fake upstream are real; OpenRouter runs for real over a stubbed fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { AnthropicErrorBody } from "../src/gateway/anthropic-errors.ts";
import { createMemoryStore } from "../src/store/memory.ts";
import type { Store } from "../src/store/types.ts";
import { createOpenRouterUpstream } from "../src/upstream/openrouter.ts";
import { demoContents, jsonBody, testApp, testGateway } from "./helpers/app.ts";
import { NOW } from "./helpers/fixtures.ts";

const REAL_MODEL = "deepseek/deepseek-v4.1-flash-1017";
const streamingMessage = {
  model: "fake/model",
  max_tokens: 64,
  stream: true,
  messages: [{ role: "user", content: "hi" }],
};
// 1,000 input + 10,000 output tokens at $1 per million: $0.011, just over a $0.01 allowance.
const costly = { "x-fake-output-tokens": "10000" };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const post = (
  app: ReturnType<typeof testApp>["app"],
  key: string,
  headers: Record<string, string> = {},
  body: unknown = streamingMessage,
) => app.request("/v1/messages", jsonBody(body, { "x-api-key": key, ...headers }));

const recordsOf = (gateway: ReturnType<typeof testGateway>) =>
  gateway.store.listUsageSince("acme", new Date(0));

/** Waits until the store holds `count` records, since a stream is charged after it ends. */
async function waitForRecords(gateway: ReturnType<typeof testGateway>, count: number) {
  await vi.waitFor(async () => expect(await recordsOf(gateway)).toHaveLength(count));
  return recordsOf(gateway);
}

const sse = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

// A short stream in OpenRouter's shape, including the usage.cost extension on message_delta.
const openRouterEvents = [
  sse("message_start", {
    message: { id: "gen-or-1", role: "assistant", usage: { input_tokens: 12, output_tokens: 1 } },
  }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hello." } }),
  sse("message_delta", {
    delta: { stop_reason: "end_turn" },
    usage: { input_tokens: 12, output_tokens: 34, cost: 0.0000123 },
  }),
  sse("message_stop", {}),
];

/**
 * OpenRouter behind a stubbed fetch whose SSE body sends the first chunk at once and the rest
 * only after `release()`, so a test can see bytes arrive before the provider has finished.
 */
function gatedOpenRouter(chunks: string[]) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const [first, ...rest] = chunks;
      controller.enqueue(encoder.encode(first));
      await released;
      for (const chunk of rest) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const fetchStub = (async () =>
    new Response(body, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  return { upstream: createOpenRouterUpstream({ apiKey: "k", fetch: fetchStub }), release };
}

/** A store that fails to write allowed records, as a full disk or lost connection would. */
function storeFailingAllowedUsage(): Store {
  const store = createMemoryStore(demoContents());
  return {
    ...store,
    addUsage: async (record) => {
      if (record.status === "allowed") throw new Error("usage table unavailable");
      await store.addUsage(record);
    },
  };
}

describe("streaming pass-through", () => {
  it("streams the provider's events through unchanged with content-type text/event-stream", async () => {
    const { upstream, release } = gatedOpenRouter(openRouterEvents);
    const { app } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    const res = await post(app, "key-staff", {}, { ...streamingMessage, model: REAL_MODEL });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("streaming response has no body");
    // The first event arrives while the provider is still holding the rest back.
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe(openRouterEvents[0]);
    release();
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      rest += decoder.decode(chunk.value, { stream: true });
    }
    expect(rest).toBe(openRouterEvents.slice(1).join(""));
  });

  it("records one usage record from message_start and the final message_delta after the stream ends", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", {
      "x-fake-input-tokens": "20",
      "x-fake-output-tokens": "300",
    });
    const text = await res.text();
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: message_stop");
    expect(await waitForRecords(gateway, 1)).toEqual([
      {
        id: "gen-1",
        companyId: "acme",
        employeeId: "sam",
        model: "fake/model",
        status: "allowed",
        bucket: "personal",
        blockReason: null,
        inputTokens: 20,
        outputTokens: 300,
        costMicros: 320,
        startedAt: NOW,
        projectTag: null,
      },
    ]);
  });

  it("prices a stream with OpenRouter's reported usage.cost when present", async () => {
    const { upstream, release } = gatedOpenRouter(openRouterEvents);
    release();
    const { app, gateway } = testApp({ gateway: testGateway({ openrouter: upstream }) });
    const res = await post(app, "key-staff", {}, { ...streamingMessage, model: REAL_MODEL });
    await res.text();
    expect(await waitForRecords(gateway, 1)).toMatchObject([
      { model: REAL_MODEL, inputTokens: 12, outputTokens: 34, costMicros: 13 },
    ]);
  });
});

describe("streams that end early", () => {
  it("charges the usage seen so far when the provider drops mid-stream", async () => {
    const { app, gateway } = testApp();
    // Two events: message_start (1,000 input, 1 output) and content_block_start.
    const res = await post(app, "key-staff", { "x-fake-drop-after": "2" });
    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow(/dropped the stream/);
    expect(await waitForRecords(gateway, 1)).toMatchObject([
      { status: "allowed", inputTokens: 1000, outputTokens: 1, costMicros: 1001 },
    ]);
  });

  it("charges the usage seen so far when the client cancels mid-stream", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("streaming response has no body");
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain("event: message_start");
    await reader.cancel();
    expect(await waitForRecords(gateway, 1)).toMatchObject([
      { status: "allowed", inputTokens: 1000, outputTokens: 1, costMicros: 1001 },
    ]);
  });

  it("records nothing for a stream that ends before any usage event", async () => {
    const { app, gateway } = testApp();
    const dropped = await post(app, "key-staff", { "x-fake-drop-after": "0" });
    await expect(dropped.text()).rejects.toThrow(/dropped the stream/);
    // A complete second stream is the marker: once it is charged, the first had its chance.
    const complete = await post(app, "key-staff");
    await complete.text();
    expect(await waitForRecords(gateway, 1)).toMatchObject([{ id: "gen-2" }]);
  });
});

describe("before the stream starts", () => {
  it("blocks a streaming request with a JSON 429 before streaming starts, recording the blocked request", async () => {
    const { app, gateway } = testApp();
    await post(app, "key-intern", costly, { ...streamingMessage, stream: false });
    const res = await post(app, "key-intern", costly);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(AnthropicErrorBody.parse(await res.json()).error.code).toBe("budget_exceeded");
    expect(await recordsOf(gateway)).toMatchObject([
      { status: "allowed" },
      { status: "blocked", blockReason: "personal_allowance_exhausted" },
    ]);
  });

  it("passes a provider error status through for a streaming request", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-fake-status": "529" });
    expect(res.status).toBe(529);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "Fake upstream error." },
    });
    expect(await recordsOf(gateway)).toEqual([]);
  });

  it("answers 502 when the provider can't be reached, and charges nothing", async () => {
    const { app, gateway } = testApp();
    const res = await post(app, "key-staff", { "x-fake-unreachable": "1" });
    expect(res.status).toBe(502);
    expect(AnthropicErrorBody.parse(await res.json()).error.code).toBe("upstream_unavailable");
    expect(await recordsOf(gateway)).toEqual([]);
  });
});

describe("recording failures", () => {
  it("logs a usage-recording failure once and still completes the stream", async () => {
    const { app, records } = testApp({
      gateway: testGateway({ store: storeFailingAllowedUsage() }),
    });
    const res = await post(app, "key-staff");
    const text = await res.text();
    expect(text.endsWith('event: message_stop\ndata: {"type":"message_stop"}\n\n')).toBe(true);

    const notRecorded = () => records.filter((record) => record.msg === "usage not recorded");
    await vi.waitFor(() => expect(notRecorded()).toHaveLength(1));
    expect(notRecorded()).toEqual([
      expect.objectContaining({
        level: "error",
        requestId: res.headers.get("x-request-id"),
        errorClass: "Error",
      }),
    ]);
  });
});
