/**
 * An in-process stand-in for an Anthropic Messages provider, driven by `x-fake-*` request
 * headers so tests and the demo can choose token usage, latency and failures.
 */

import type { Upstream } from "./types.ts";

/** A fake upstream. It never reports a provider cost, so the price table prices its usage. */
export function createFakeUpstream(): Upstream {
  throw new Error("not implemented");
}
