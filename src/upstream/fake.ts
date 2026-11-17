/**
 * An in-process stand-in for an Anthropic Messages provider, driven by `x-fake-*` request
 * headers so tests and the demo can choose token usage, latency and failures. It answers JSON
 * from `send` and Anthropic server-sent events from `stream`.
 */

import type { TokenUsage } from "../budget/types.ts";
import { UpstreamUnavailableError } from "../errors.ts";
import type {
  StreamingUpstream,
  UpstreamRequest,
  UpstreamResponse,
  UpstreamStream,
} from "./types.ts";

const DEFAULT_INPUT_TOKENS = 1000;
const DEFAULT_OUTPUT_TOKENS = 500;
const DEFAULT_STATUS = 200;
const FIRST_ERROR_STATUS = 400;
const UNKNOWN_MODEL = "unknown";
const REPLY_TEXT = "Fake reply.";

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

type FakeMessage = { id: string; model: string };

type FakeAnswer =
  | { kind: "error"; response: UpstreamResponse }
  | { kind: "message"; status: number; usage: TokenUsage; message: FakeMessage };

function successResponse(
  status: number,
  message: FakeMessage,
  { inputTokens, outputTokens }: TokenUsage,
): UpstreamResponse {
  return {
    status,
    body: {
      id: message.id,
      type: "message",
      role: "assistant",
      model: message.model,
      content: [{ type: "text", text: REPLY_TEXT }],
      stop_reason: "end_turn",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
    usage: { inputTokens, outputTokens },
    costMicros: null,
  };
}

/** The events Anthropic sends for a one-block text reply, as `[event name, data]` pairs. */
function messageEvents(message: FakeMessage, { inputTokens, outputTokens }: TokenUsage) {
  const startMessage = {
    id: message.id,
    type: "message",
    role: "assistant",
    model: message.model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    // Anthropic counts the first output token at the start, then reports the total at the end.
    usage: { input_tokens: inputTokens, output_tokens: Math.min(1, outputTokens) },
  };
  const events: [string, Record<string, unknown>][] = [
    ["message_start", { message: startMessage }],
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["ping", {}],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text: REPLY_TEXT } }],
    ["content_block_stop", { index: 0 }],
    [
      "message_delta",
      {
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: outputTokens },
      },
    ],
    ["message_stop", {}],
  ];
  return events.map(
    ([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
  );
}

/**
 * The events as a byte stream, one event per read, that errors after `dropAfter` events the way
 * a provider connection that drops mid-stream does.
 */
function eventStream(events: string[], dropAfter: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= dropAfter) {
        // A plain Error like fetch's own "terminated": once a stream has started, nothing
        // renders it as an AppError; it only ends the stream.
        controller.error(
          new Error(`Fake upstream dropped the stream after ${sent} event(s) (x-fake-drop-after).`),
        );
        return;
      }
      const next = events[sent];
      if (next === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next));
      sent += 1;
    },
  });
}

/**
 * A fake upstream. It never reports a provider cost, so the price table prices its usage.
 * Message ids count up per instance.
 *
 * @throws {UpstreamUnavailableError} From `send` and `stream`, when the request has
 * `x-fake-unreachable: 1`. A stream with `x-fake-drop-after: <n>` errors after n events.
 */
export function createFakeUpstream(): StreamingUpstream {
  let messageCount = 0;

  /** What the headers ask for, after their delay: an error response or a message to send. */
  async function answer({ body, headers }: UpstreamRequest): Promise<FakeAnswer> {
    if (headers["x-fake-unreachable"] === "1") throw new UpstreamUnavailableError();

    await waitMs(numberHeader(headers, "x-fake-delay-ms", 0));

    const status = numberHeader(headers, "x-fake-status", DEFAULT_STATUS);
    const inputTokens = numberHeader(headers, "x-fake-input-tokens", DEFAULT_INPUT_TOKENS);
    const outputTokens = numberHeader(headers, "x-fake-output-tokens", DEFAULT_OUTPUT_TOKENS);
    const usage = { inputTokens, outputTokens };

    if (status >= FIRST_ERROR_STATUS) {
      const reportsUsage = headers["x-fake-usage"] === "report";
      return { kind: "error", response: errorResponse(status, reportsUsage ? usage : null) };
    }
    messageCount += 1;
    const message = { id: `msg_fake_${messageCount}`, model: modelOf(body) };
    return { kind: "message", status, usage, message };
  }

  return {
    async send(request: UpstreamRequest): Promise<UpstreamResponse> {
      const fake = await answer(request);
      if (fake.kind === "error") return fake.response;
      return successResponse(fake.status, fake.message, fake.usage);
    },

    async stream(request: UpstreamRequest): Promise<UpstreamResponse | UpstreamStream> {
      const fake = await answer(request);
      if (fake.kind === "error") return fake.response;
      const dropAfter = numberHeader(request.headers, "x-fake-drop-after", Infinity);
      const events = eventStream(messageEvents(fake.message, fake.usage), dropAfter);
      return { kind: "stream", status: fake.status, events };
    },
  };
}
