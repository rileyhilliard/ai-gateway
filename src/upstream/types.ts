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

/** An inference provider. */
export interface Upstream {
  /**
   * Sends one request and returns the provider's response, error statuses included.
   *
   * @throws {UpstreamUnavailableError} When the provider can't be reached or isn't configured.
   */
  send(request: UpstreamRequest): Promise<UpstreamResponse>;
}
