/**
 * Reads token usage from an Anthropic server-sent event stream while passing its bytes through
 * untouched. The gateway service decides what to charge; this module only reports what the
 * provider's `message_start` and `message_delta` events said by the time the stream ended.
 */

import type { Micros, TokenUsage } from "../budget/types.ts";

/** Usage a provider reported: token counts, and its own cost in micros when it sent one. */
export type ReportedUsage = { usage: TokenUsage; costMicros: Micros | null };

/** Splits server-sent event text into the data of each complete event. */
export type SseParser = {
  /** Takes the next piece of decoded text and returns the data of every event it completed. */
  push(text: string): string[];
};

/** The pass-through stream and the usage it saw, settled once the stream ends for any reason. */
export type WatchedStream = {
  events: ReadableStream<Uint8Array>;
  /** Resolves when the stream completes, fails or is cancelled; null when no usage was seen. */
  ended: Promise<ReportedUsage | null>;
};

const LINE_BREAK = /\r\n|\r|\n/;
const DATA_FIELD = "data:";
// OpenRouter's usage.cost is in dollars; rounding up, like the JSON path, never undercharges.
const MICROS_PER_DOLLAR = 1_000_000;

/**
 * A parser for the SSE wire format: lines end in `\n`, `\r\n` or `\r`, a blank line ends an
 * event, and several `data:` lines join with `\n`. Other fields and comments are ignored, since
 * the gateway only needs each event's JSON data.
 */
export function createSseParser(): SseParser {
  let unfinishedLine = "";
  let dataLines: string[] = [];

  return {
    push(text) {
      const { lines, rest } = completeLines(unfinishedLine + text);
      unfinishedLine = rest;
      const completed: string[] = [];
      for (const line of lines) {
        if (line === "") {
          if (dataLines.length > 0) completed.push(dataLines.join("\n"));
          dataLines = [];
        } else if (line.startsWith(DATA_FIELD)) {
          dataLines.push(withoutLeadingSpace(line.slice(DATA_FIELD.length)));
        }
      }
      return completed;
    },
  };
}

/**
 * Wraps a provider's event stream so its bytes pass through as they arrive while their usage is
 * read on the way. Cancelling the returned stream cancels the source, which closes the provider
 * connection. A source failure is passed on to the reader unchanged.
 */
export function watchStreamUsage(source: ReadableStream<Uint8Array>): WatchedStream {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const tally = createUsageTally();
  let finish: (usage: ReportedUsage | null) => void = () => {};
  const ended = new Promise<ReportedUsage | null>((resolve) => {
    finish = resolve;
  });
  let isFinished = false;
  const end = () => {
    isFinished = true;
    finish(tally.current());
  };

  const events = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        end();
        controller.error(error);
        return;
      }
      // A cancel can land while the read above is pending; the stream is closed by then.
      if (isFinished) return;
      if (chunk.done) {
        end();
        controller.close();
        return;
      }
      for (const data of parser.push(decoder.decode(chunk.value, { stream: true }))) {
        tally.observe(data);
      }
      controller.enqueue(chunk.value);
    },
    async cancel(reason) {
      end();
      await reader.cancel(reason);
    },
  });
  return { events, ended };
}

/** Running totals from the usage events seen so far. */
function createUsageTally() {
  let inputTokens = 0;
  let outputTokens = 0;
  let costMicros: Micros | null = null;
  let hasUsage = false;

  return {
    observe(data: string): void {
      const usage = usageOfEvent(parseJson(data));
      if (!usage) return;
      hasUsage = true;
      // Input is fixed once known, output is cumulative, so the latest value of each wins.
      if (typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
      if (typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
      if (typeof usage.cost === "number") costMicros = Math.ceil(usage.cost * MICROS_PER_DOLLAR);
    },
    current(): ReportedUsage | null {
      return hasUsage ? { usage: { inputTokens, outputTokens }, costMicros } : null;
    },
  };
}

/** The `usage` object of a `message_start` or `message_delta` event, or null for any other. */
function usageOfEvent(event: unknown): Record<string, unknown> | null {
  if (!isObject(event)) return null;
  if (event.type === "message_start" && isObject(event.message)) {
    return isObject(event.message.usage) ? event.message.usage : null;
  }
  if (event.type === "message_delta") return isObject(event.usage) ? event.usage : null;
  return null;
}

/**
 * The event data as JSON, or undefined when it isn't JSON. That isn't a failure to report: the
 * bytes still reach the client untouched, and such an event can't carry usage anyway.
 */
function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The complete lines in `text` and the unfinished remainder. A trailing `\r` is held back,
 * because the next chunk may start with the `\n` of the same `\r\n` line break.
 */
function completeLines(text: string): { lines: string[]; rest: string } {
  const heldBack = text.endsWith("\r") ? "\r" : "";
  const lines = text.slice(0, text.length - heldBack.length).split(LINE_BREAK);
  const rest = (lines.pop() ?? "") + heldBack;
  return { lines, rest };
}

/** SSE strips one space after the field's colon, and only one. */
function withoutLeadingSpace(value: string): string {
  return value.startsWith(" ") ? value.slice(1) : value;
}
