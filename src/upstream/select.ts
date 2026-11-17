/**
 * Chooses which upstream serves a model: `fake/` model ids go to the fake upstream, every
 * other id to OpenRouter.
 */

import type { Upstream } from "./types.ts";

/** The upstreams the gateway can route to. */
export type Upstreams = { fake: Upstream; openrouter: Upstream };

/** The upstream for `model`. */
export function selectUpstream(model: string, upstreams: Upstreams): Upstream {
  throw new Error("not implemented");
}
