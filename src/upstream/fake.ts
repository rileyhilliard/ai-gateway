/**
 * An in-process stand-in for an Anthropic Messages provider, driven by `x-fake-*` request
 * headers so tests and the demo can choose token usage, latency and failures.
 */

import type { TokenUsage } from "../budget/types.ts";
import { UpstreamUnavailableError } from "../errors.ts";
import type { Upstream, UpstreamRequest, UpstreamResponse } from "./types.ts";

const DEFAULT_INPUT_TOKENS = 1000;
const DEFAULT_OUTPUT_TOKENS = 500;
const DEFAULT_STATUS = 200;
const FIRST_ERROR_STATUS = 400;
const UNKNOWN_MODEL = "unknown";

/** Reads a numeric header, falling back to `fallback` when it is absent or not a number. */
function numberHeader(headers: Record<string, string>, name: string, fallback: number): number {
  const raw = headers[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isNaN(value) ? fallback : value;
}

/** The request's `model` when the body is an object with a string `model`. */
function modelOf(body: unknown): string {
  if (typeof body !== "object" || body === null || !("model" in body)) return UNKNOWN_MODEL;
  return typeof body.model === "string" ? body.model : UNKNOWN_MODEL;
}

function waitMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorResponse(status: number, usage: UpstreamResponse["usage"]): UpstreamResponse {
  return {
    status,
    body: { type: "error", error: { type: "api_error", message: "Fake upstream error." } },
    usage,
    costMicros: null,
  };
}

function successResponse(
  status: number,
  message: { number: number; model: string },
  { inputTokens, outputTokens }: TokenUsage,
): UpstreamResponse {
  return {
    status,
    body: {
      id: `msg_fake_${message.number}`,
      type: "message",
      role: "assistant",
      model: message.model,
      content: [{ type: "text", text: "Fake reply." }],
      stop_reason: "end_turn",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
    usage: { inputTokens, outputTokens },
    costMicros: null,
  };
}

/**
 * A fake upstream. It never reports a provider cost, so the price table prices its usage.
 * Message ids count up per instance.
 *
 * @throws {UpstreamUnavailableError} From `send`, when the request has `x-fake-unreachable: 1`.
 */
export function createFakeUpstream(): Upstream {
  let messageCount = 0;

  return {
    async send({ body, headers }: UpstreamRequest): Promise<UpstreamResponse> {
      if (headers["x-fake-unreachable"] === "1") throw new UpstreamUnavailableError();

      await waitMs(numberHeader(headers, "x-fake-delay-ms", 0));

      const status = numberHeader(headers, "x-fake-status", DEFAULT_STATUS);
      const inputTokens = numberHeader(headers, "x-fake-input-tokens", DEFAULT_INPUT_TOKENS);
      const outputTokens = numberHeader(headers, "x-fake-output-tokens", DEFAULT_OUTPUT_TOKENS);

      if (status >= FIRST_ERROR_STATUS) {
        const reportsUsage = headers["x-fake-usage"] === "report";
        return errorResponse(status, reportsUsage ? { inputTokens, outputTokens } : null);
      }
      messageCount += 1;
      return successResponse(
        status,
        { number: messageCount, model: modelOf(body) },
        { inputTokens, outputTokens },
      );
    },
  };
}
