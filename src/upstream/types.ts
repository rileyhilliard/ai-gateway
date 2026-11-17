/**
 * The contract between the gateway and an inference provider. The fake and OpenRouter
 * upstreams both implement it, so the gateway never knows which one answered.
 */

import type { Micros, TokenUsage } from "../budget/types.ts";

/** What the gateway forwards: the client's JSON body and the headers allowed through. */
export type UpstreamRequest = { body: unknown; headers: Record<string, string> };

/**
 * The provider's answer. `usage` is null when the provider reported no token counts.
 * `costMicros` is the provider's own reported cost (OpenRouter's `usage.cost`), or null.
 */
export type UpstreamResponse = {
  status: number;
  body: unknown;
  usage: TokenUsage | null;
  costMicros: Micros | null;
};

/**
 * A successful streaming answer: the provider's Anthropic server-sent events as raw bytes,
 * unread, so the gateway can pass them on as they arrive and read usage on the way through.
 */
export type UpstreamStream = {
  kind: "stream";
  status: number;
  events: ReadableStream<Uint8Array>;
};

/** An inference provider. */
export interface Upstream {
  /**
   * Sends one request and returns the provider's response, error statuses included.
   *
   * @throws {UpstreamUnavailableError} When the provider can't be reached or isn't configured.
   */
  send(request: UpstreamRequest): Promise<UpstreamResponse>;
  /**
   * Sends one `stream: true` request. A 2xx event stream comes back as an `UpstreamStream`;
   * any other answer comes back read in full, exactly as `send` returns it.
   *
   * @throws {UpstreamUnavailableError} When the provider can't be reached before it answers.
   */
  stream(request: UpstreamRequest): Promise<UpstreamResponse | UpstreamStream>;
}

/** Whether an upstream answer is a stream rather than a JSON response. */
export function isUpstreamStream(
  response: UpstreamResponse | UpstreamStream,
): response is UpstreamStream {
  return "kind" in response && response.kind === "stream";
}
