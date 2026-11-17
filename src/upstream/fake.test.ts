/**
 * The fake upstream answers like an Anthropic Messages provider, with token usage, latency and
 * failures chosen by `x-fake-*` request headers.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../errors.ts";
import { createFakeUpstream } from "./fake.ts";

const body = { model: "fake/model", max_tokens: 64, messages: [{ role: "user", content: "hi" }] };
const send = (headers: Record<string, string> = {}) => createFakeUpstream().send({ body, headers });

afterEach(() => {
  vi.useRealTimers();
});

describe("createFakeUpstream", () => {
  it("answers 200 with an Anthropic message reporting 1000 input and 500 output tokens", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(response.costMicros).toBeNull();
    expect(response.body).toMatchObject({
      type: "message",
      role: "assistant",
      model: "fake/model",
      content: [{ type: "text", text: "Fake reply." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
  });

  it("reports the token counts set by x-fake-input-tokens and x-fake-output-tokens", async () => {
    const response = await send({ "x-fake-input-tokens": "20", "x-fake-output-tokens": "10000" });
    expect(response.usage).toEqual({ inputTokens: 20, outputTokens: 10_000 });
    expect(response.body).toMatchObject({ usage: { input_tokens: 20, output_tokens: 10_000 } });
  });

  it("returns the status from x-fake-status with an Anthropic error body and no usage", async () => {
    const response = await send({ "x-fake-status": "529" });
    expect(response.status).toBe(529);
    expect(response.usage).toBeNull();
    expect(response.body).toEqual({
      type: "error",
      error: { type: "api_error", message: "Fake upstream error." },
    });
  });

  it("reports usage on an error when x-fake-usage is report", async () => {
    const response = await send({ "x-fake-status": "500", "x-fake-usage": "report" });
    expect(response.status).toBe(500);
    expect(response.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
  });

  it("waits x-fake-delay-ms before answering", async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = send({ "x-fake-delay-ms": "500" }).then((response) => {
      settled = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });

  it("throws UpstreamUnavailableError when x-fake-unreachable is 1", async () => {
    await expect(send({ "x-fake-unreachable": "1" })).rejects.toThrow(UpstreamUnavailableError);
  });
});
