/**
 * Chooses which upstream serves a model: `fake/` model ids go to the fake upstream, every
 * other id to OpenRouter.
 */

import type { Upstream } from "./types.ts";

const FAKE_MODEL_PREFIX = "fake/";

/** The upstreams the gateway can route to. */
export type Upstreams = { fake: Upstream; openrouter: Upstream };

/** The upstream for `model`. */
export function selectUpstream(model: string, upstreams: Upstreams): Upstream {
  return model.startsWith(FAKE_MODEL_PREFIX) ? upstreams.fake : upstreams.openrouter;
}
