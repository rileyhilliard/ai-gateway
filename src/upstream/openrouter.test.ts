/**
 * The OpenRouter upstream: what it sends to OpenRouter's Anthropic Messages endpoint and how it
 * reads usage and cost back. `fetch` is a stub at the network boundary; nothing leaves the
 * machine.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../errors.ts";
import { createOpenRouterUpstream } from "./openrouter.ts";
import { isUpstreamStream } from "./types.ts";

afterEach(() => {
  vi.useRealTimers();
});

type SentRequest = { url: string; init: RequestInit };

function stubFetch(response: Response | Error) {
  const sent: SentRequest[] = [];
  const fetchStub = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetch: fetchStub as typeof fetch, sent };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const messageBody = {
  model: "deepseek/deepseek-v4.1-flash-1017",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};

const incomingHeaders = {
  "content-type": "application/json",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "tools-2024-04-04",
  "x-api-key": "key-engineer",
  "x-fake-status": "500",
  host: "localhost:3000",
};

const okBody = (usage: Record<string, unknown>) => ({
  id: "gen-1",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello." }],
  usage,
});

describe("createOpenRouterUpstream", () => {
  it("posts the body unchanged to /api/v1/messages with the company key as a Bearer token", async () => {
    const { fetch, sent } = stubFetch(jsonResponse(okBody({ input_tokens: 1, output_tokens: 1 })));
    await createOpenRouterUpstream({ apiKey: "sk-or-test", fetch }).send({
      body: messageBody,
      headers: incomingHeaders,
    });
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe("https://openrouter.ai/api/v1/messages");
    expect(request?.init.method).toBe("POST");
    expect(JSON.parse(String(request?.init.body))).toEqual(messageBody);
    expect(new Headers(request?.init.headers).get("authorization")).toBe("Bearer sk-or-test");
  });

  it("forwards only content-type and the anthropic-* headers, never the employee key", async () => {
    const { fetch, sent } = stubFetch(jsonResponse(okBody({ input_tokens: 1, output_tokens: 1 })));
    await createOpenRouterUpstream({ apiKey: "sk-or-test", fetch }).send({
      body: messageBody,
      headers: incomingHeaders,
    });
    const headers = Object.fromEntries(new Headers(sent[0]?.init.headers).entries());
    expect(headers).toEqual({
      authorization: "Bearer sk-or-test",
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "tools-2024-04-04",
    });
  });

  it("reads token usage and converts OpenRouter's USD cost to micro-dollars, rounding up", async () => {
    const usage = { input_tokens: 12, output_tokens: 34, cost: 0.0000123 };
    const { fetch } = stubFetch(jsonResponse(okBody(usage)));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    expect(response.status).toBe(200);
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 34 });
    expect(response.costMicros).toBe(13);
    expect(response.body).toEqual(okBody(usage));
  });

  it("reports no cost when OpenRouter's usage has none", async () => {
    const { fetch } = stubFetch(jsonResponse(okBody({ input_tokens: 5, output_tokens: 6 })));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    expect(response.costMicros).toBeNull();
  });

  it("returns an error status and body as they came, with usage only if the body has some", async () => {
    const errorBody = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
    const { fetch } = stubFetch(jsonResponse(errorBody, 529));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    expect(response).toEqual({ status: 529, body: errorBody, usage: null, costMicros: null });
  });

  it("returns a non-JSON body as text with no usage", async () => {
    const { fetch } = stubFetch(new Response("Bad Gateway", { status: 502 }));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    expect(response).toEqual({ status: 502, body: "Bad Gateway", usage: null, costMicros: null });
  });

  it("throws UpstreamUnavailableError, keeping the cause, when fetch rejects", async () => {
    const networkError = new TypeError("fetch failed");
    const { fetch } = stubFetch(networkError);
    const sending = createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    await expect(sending).rejects.toThrow(UpstreamUnavailableError);
    await expect(sending).rejects.toMatchObject({ cause: networkError });
  });

  it("throws UpstreamUnavailableError without calling fetch when no key is configured", async () => {
    const { fetch, sent } = stubFetch(jsonResponse({}));
    await expect(
      createOpenRouterUpstream({ apiKey: undefined, fetch }).send({
        body: messageBody,
        headers: {},
      }),
    ).rejects.toThrow(UpstreamUnavailableError);
    expect(sent).toHaveLength(0);
  });

  it("throws UpstreamUnavailableError when the connection drops while reading the body", async () => {
    const dropped = new TypeError("terminated");
    const body = new ReadableStream({
      start(controller) {
        controller.error(dropped);
      },
    });
    const { fetch } = stubFetch(new Response(body, { status: 200 }));
    const sending = createOpenRouterUpstream({ apiKey: "k", fetch }).send({
      body: messageBody,
      headers: {},
    });
    await expect(sending).rejects.toThrow(UpstreamUnavailableError);
    await expect(sending).rejects.toMatchObject({ cause: dropped });
  });

  it("gives up with UpstreamUnavailableError when OpenRouter doesn't answer in time", async () => {
    // A fetch that only settles when its signal aborts, like a provider that never responds.
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const sending = createOpenRouterUpstream({ apiKey: "k", fetch: hanging, timeoutMs: 20 }).send({
      body: messageBody,
      headers: {},
    });
    await expect(sending).rejects.toThrow(UpstreamUnavailableError);
    await expect(sending).rejects.toMatchObject({ cause: { name: "TimeoutError" } });
  });
});

describe("createOpenRouterUpstream streaming", () => {
  const streamBody = { ...messageBody, stream: true };
  const sseText =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":3}}}\n\n' +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const sseResponse = (body: BodyInit) =>
    new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });

  it("returns a 2xx SSE body as an unread stream of the provider's bytes", async () => {
    const { fetch, sent } = stubFetch(sseResponse(sseText));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).stream({
      body: streamBody,
      headers: {},
    });
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual(streamBody);
    if (!isUpstreamStream(response)) throw new Error("expected a stream");
    expect(response.status).toBe(200);
    expect(await new Response(response.events).text()).toBe(sseText);
  });

  it("reads an error status in full, as send does", async () => {
    const errorBody = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
    const { fetch } = stubFetch(jsonResponse(errorBody, 529));
    const response = await createOpenRouterUpstream({ apiKey: "k", fetch }).stream({
      body: streamBody,
      headers: {},
    });
    expect(response).toEqual({ status: 529, body: errorBody, usage: null, costMicros: null });
  });

  it("stops the timeout once the stream has started, so a long stream isn't cut off", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchStub = (async (_: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return sseResponse(sseText);
    }) as typeof fetch;
    await createOpenRouterUpstream({ apiKey: "k", fetch: fetchStub, timeoutMs: 20 }).stream({
      body: streamBody,
      headers: {},
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(signal?.aborted).toBe(false);
  });

  it("gives up with UpstreamUnavailableError when the stream doesn't start in time", async () => {
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const streaming = createOpenRouterUpstream({
      apiKey: "k",
      fetch: hanging,
      timeoutMs: 20,
    }).stream({ body: streamBody, headers: {} });
    await expect(streaming).rejects.toThrow(UpstreamUnavailableError);
    await expect(streaming).rejects.toMatchObject({ cause: { name: "TimeoutError" } });
  });
});
