/**
 * Forwards requests to OpenRouter's Anthropic Messages endpoint with the company key, and
 * reads token usage and OpenRouter's reported cost from the response.
 */

import type { Upstream } from "./types.ts";

/** How to reach OpenRouter. `fetch` is passed in so tests never touch the network. */
export type OpenRouterOptions = {
  apiKey: string | undefined;
  fetch: typeof fetch;
  /** Defaults to https://openrouter.ai/api. */
  baseUrl?: string;
};

/** An upstream that sends each request to OpenRouter. A missing key fails per request. */
export function createOpenRouterUpstream(options: OpenRouterOptions): Upstream {
  throw new Error("not implemented");
}
