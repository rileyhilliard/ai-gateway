/**
 * An in-process stand-in for an Anthropic Messages provider, driven by `x-fake-*` request
 * headers so tests and the demo can choose token usage, latency and failures. It answers JSON
 * from `send` and Anthropic server-sent events from `stream`.
 */

import type { TokenUsage } from "../budget/types.ts";
import { BadRequestError, type Issue, UpstreamUnavailableError } from "../errors.ts";
import type { Upstream, UpstreamRequest, UpstreamResponse, UpstreamStream } from "./types.ts";

const DEFAULT_INPUT_TOKENS = 1000;
const DEFAULT_OUTPUT_TOKENS = 500;
const DEFAULT_STATUS = 200;
const FIRST_ERROR_STATUS = 400;
const UNKNOWN_MODEL = "unknown";
const REPLY_TEXT = "Fake reply.";

type IntegerRange = { min: number; max: number };

// Token counts become recorded cost, so a negative or huge count would corrupt every spend sum.
const TOKEN_RANGE: IntegerRange = { min: 0, max: 10_000_000 };
const DELAY_MS_RANGE: IntegerRange = { min: 0, max: 10_000 };
const DROP_AFTER_RANGE: IntegerRange = { min: 0, max: 1_000 };
// 200 or an error status: 204, 205 and 304 can't carry the fake's JSON body.
const ERROR_STATUS_RANGE: IntegerRange = { min: FIRST_ERROR_STATUS, max: 599 };
const WHOLE_NUMBER = /^\d+$/;

/** What a request's `x-fake-*` headers ask the fake upstream for, defaults filled in. */
export type FakeControls = {
  inputTokens: number;
  outputTokens: number;
  status: number;
  delayMs: number;
  /** How many stream events to send before dropping the connection; Infinity never drops. */
  dropAfter: number;
};

/**
 * Reads and checks the numeric `x-fake-*` headers. Missing headers take their defaults.
 *
 * @throws {BadRequestError} Naming each header that isn't a whole number in its range.
 */
export function readFakeControls(headers: Record<string, string>): FakeControls {
  const issues: Issue[] = [];

  const integer = (name: string, range: IntegerRange, fallback: number): number => {
    const value = wholeNumberHeader(headers, name);
    if (value === undefined) return fallback;
    if (value >= range.min && value <= range.max) return value;
    issues.push({
      path: `header.${name}`,
      message: `${name} must be a whole number from ${range.min} to ${range.max}.`,
    });
    return fallback;
  };

  const controls = {
    inputTokens: integer("x-fake-input-tokens", TOKEN_RANGE, DEFAULT_INPUT_TOKENS),
    outputTokens: integer("x-fake-output-tokens", TOKEN_RANGE, DEFAULT_OUTPUT_TOKENS),
    status: fakeStatus(headers, issues),
    delayMs: integer("x-fake-delay-ms", DELAY_MS_RANGE, 0),
    dropAfter: integer("x-fake-drop-after", DROP_AFTER_RANGE, Infinity),
  };
  if (issues.length > 0) throw new BadRequestError(issues);
  return controls;
}

/** `x-fake-status`: 200 when missing, else 200 or an error status. Adds an issue otherwise. */
function fakeStatus(headers: Record<string, string>, issues: Issue[]): number {
  const name = "x-fake-status";
  const value = wholeNumberHeader(headers, name);
  if (value === undefined) return DEFAULT_STATUS;
  const isErrorStatus = value >= ERROR_STATUS_RANGE.min && value <= ERROR_STATUS_RANGE.max;
  if (value === DEFAULT_STATUS || isErrorStatus) return value;
  issues.push({
    path: `header.${name}`,
    message: `${name} must be 200, or a whole number from ${ERROR_STATUS_RANGE.min} to ${ERROR_STATUS_RANGE.max}.`,
  });
  return DEFAULT_STATUS;
}

/**
 * The header as a number when it's all digits, NaN when it's present but isn't (so it fails
 * every range check), or undefined when it's missing. Digits only, because Number() would also
 * take "-5", "1e9", "Infinity" and "0x10".
 */
function wholeNumberHeader(headers: Record<string, string>, name: string): number | undefined {
  const raw = headers[name];
  if (raw === undefined) return undefined;
  return WHOLE_NUMBER.test(raw) ? Number(raw) : Number.NaN;
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
  | {
      kind: "message";
      status: number;
      usage: TokenUsage;
      message: FakeMessage;
      dropAfter: number;
    };

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
 * @throws {BadRequestError} From `send` and `stream`, when an `x-fake-*` header is out of range
 * (see readFakeControls; the gateway checks them before its budget decision).
 * @throws {UpstreamUnavailableError} From `send` and `stream`, when the request has
 * `x-fake-unreachable: 1`. A stream with `x-fake-drop-after: <n>` errors after n events.
 */
export function createFakeUpstream(): Upstream {
  let messageCount = 0;

  /** What the headers ask for, after their delay: an error response or a message to send. */
  async function answer({ body, headers }: UpstreamRequest): Promise<FakeAnswer> {
    const { status, inputTokens, outputTokens, delayMs, dropAfter } = readFakeControls(headers);
    if (headers["x-fake-unreachable"] === "1") throw new UpstreamUnavailableError();

    await waitMs(delayMs);

    const usage = { inputTokens, outputTokens };
    if (status >= FIRST_ERROR_STATUS) {
      const reportsUsage = headers["x-fake-usage"] === "report";
      return { kind: "error", response: errorResponse(status, reportsUsage ? usage : null) };
    }
    messageCount += 1;
    const message = { id: `msg_fake_${messageCount}`, model: modelOf(body) };
    return { kind: "message", status, usage, message, dropAfter };
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
      const events = eventStream(messageEvents(fake.message, fake.usage), fake.dropAfter);
      return { kind: "stream", status: fake.status, events };
    },
  };
}
