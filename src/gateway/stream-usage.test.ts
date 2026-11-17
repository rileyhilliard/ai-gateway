/**
 * Reading usage from an Anthropic event stream on its way through: the SSE framing across
 * chunk boundaries, and which event's numbers win. The HTTP tests cover the same reader through
 * POST /v1/messages; these reach the framing and precedence cases the fake upstream never sends.
 */

import { describe, expect, it } from "vitest";
import { createSseParser, watchStreamUsage } from "./stream-usage.ts";

// The frame the client gets in place of the provider's lost events, spelled out in full here so
// a change to its wording or shape fails this test.
const EXPECTED_DROPPED_EVENT =
  'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"The provider\'s stream ended early. Usage up to that point was charged; retry the request."}}\n\n';

const encoder = new TextEncoder();

/** A source that emits each string as its own chunk, then closes. */
function sourceOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const event = (data: unknown) => `event: x\ndata: ${JSON.stringify(data)}\n\n`;
const messageStart = (usage: Record<string, unknown>) =>
  event({ type: "message_start", message: { id: "msg_1", usage } });
const messageDelta = (usage: Record<string, unknown>) =>
  event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage });

/** Runs the chunks through the watcher, reading every byte, and returns what came out. */
async function watch(chunks: string[]) {
  const { events, ended } = watchStreamUsage(sourceOf(chunks));
  const text = await new Response(events).text();
  return { text, usage: (await ended).usage };
}

describe("createSseParser", () => {
  it("handles events split across chunks and \\r\\n line endings", () => {
    const parser = createSseParser();
    expect(parser.push("event: message_start\r\nda")).toEqual([]);
    expect(parser.push('ta: {"a":1}\r')).toEqual([]);
    expect(parser.push("\n\r\nevent: ping\ndata: second\n")).toEqual(['{"a":1}']);
    expect(parser.push("data: line two\n\n: a comment\n\ndata:third\r\r\n")).toEqual([
      "second\nline two",
      "third",
    ]);
  });
});

describe("watchStreamUsage", () => {
  it("passes every byte through unchanged", async () => {
    const chunks = [
      messageStart({ input_tokens: 1, output_tokens: 1 }),
      "event: ping\ndata: {",
      "}\n\n",
    ];
    expect((await watch(chunks)).text).toBe(chunks.join(""));
  });

  it("takes input from message_start and the cumulative output from the last message_delta", async () => {
    const { usage } = await watch([
      messageStart({ input_tokens: 25, output_tokens: 1 }),
      messageDelta({ output_tokens: 40 }),
      messageDelta({ output_tokens: 90 }),
    ]);
    expect(usage).toEqual({ usage: { inputTokens: 25, outputTokens: 90 }, costMicros: null });
  });

  it("lets input_tokens on message_delta win over message_start's", async () => {
    const { usage } = await watch([
      messageStart({ input_tokens: 40, output_tokens: 0 }),
      messageDelta({ input_tokens: 31, output_tokens: 7 }),
    ]);
    expect(usage).toEqual({ usage: { inputTokens: 31, outputTokens: 7 }, costMicros: null });
  });

  it("converts a reported usage.cost to micros, rounding up, from either event", async () => {
    const fromStart = await watch([
      messageStart({ input_tokens: 1, output_tokens: 1, cost: 0.0000012 }),
    ]);
    expect(fromStart.usage?.costMicros).toBe(2);
    const fromDelta = await watch([
      messageStart({ input_tokens: 1, output_tokens: 1, cost: 0.0000012 }),
      messageDelta({ output_tokens: 5, cost: 0.0000123 }),
    ]);
    expect(fromDelta.usage?.costMicros).toBe(13);
  });

  it("reports no usage for a stream without a usage event, skipping data that isn't JSON", async () => {
    const { text, usage } = await watch([
      'event: ping\ndata: {"type":"ping"}\n\n',
      "data: not json\n\n",
    ]);
    expect(usage).toBeNull();
    expect(text).toContain("not json");
  });

  it("ends a failed source with an Anthropic error event and reports the drop with the usage so far", async () => {
    const dropped = new Error("connection reset");
    let pulls = 0;
    // Erroring in start() would discard the queued event, so the drop comes on the next pull.
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode(messageStart({ input_tokens: 8, output_tokens: 1 })));
        } else {
          controller.error(dropped);
        }
      },
    });
    const { events, ended } = watchStreamUsage(source);
    const text = await new Response(events).text();
    expect(text).toBe(messageStart({ input_tokens: 8, output_tokens: 1 }) + EXPECTED_DROPPED_EVENT);
    expect(await ended).toEqual({
      kind: "dropped",
      usage: { usage: { inputTokens: 8, outputTokens: 1 }, costMicros: null },
      cause: dropped,
    });
  });

  it("reports the usage seen so far when the reader cancels, and cancels the source", async () => {
    let sourceCancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(messageStart({ input_tokens: 8, output_tokens: 1 })));
      },
      cancel() {
        sourceCancelled = true;
      },
    });
    const { events, ended } = watchStreamUsage(source);
    const reader = events.getReader();
    await reader.read();
    await reader.cancel();
    expect(await ended).toEqual({
      kind: "cancelled",
      usage: { usage: { inputTokens: 8, outputTokens: 1 }, costMicros: null },
    });
    expect(sourceCancelled).toBe(true);
  });
});
