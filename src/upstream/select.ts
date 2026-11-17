/**
 * Chooses which upstream serves a model: `fake/` model ids go to the fake upstream, every
 * other id to OpenRouter.
 */

import type { Upstream } from "./types.ts";

const FAKE_MODEL_PREFIX = "fake/";

/** The upstreams the gateway can route to. `fake` is absent when FAKE_UPSTREAM is off. */
export type Upstreams = { fake?: Upstream; openrouter: Upstream };

/**
 * The upstream for `model`.
 *
 * @throws {Error} For a `fake/` model with no fake upstream. The price table leaves fake models
 * out in that case, so the gateway rejects them as unknown before getting here.
 */
export function selectUpstream(model: string, upstreams: Upstreams): Upstream {
  if (!model.startsWith(FAKE_MODEL_PREFIX)) return upstreams.openrouter;
  if (!upstreams.fake) {
    throw new Error(`${model} has a price but the fake upstream is off (FAKE_UPSTREAM=0).`);
  }
  return upstreams.fake;
}
