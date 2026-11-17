/**
 * Upstream selection: `fake/` models stay in process, everything else goes to OpenRouter.
 */

import { describe, expect, it } from "vitest";
import { selectUpstream } from "./select.ts";
import type { Upstream } from "./types.ts";

const unused = (): never => {
  throw new Error("not called in this test");
};
const fake: Upstream = { send: unused };
const openrouter: Upstream = { send: unused };

describe("selectUpstream", () => {
  it("sends fake/ models to the fake upstream", () => {
    expect(selectUpstream("fake/model", { fake, openrouter })).toBe(fake);
  });

  it("sends every other model to OpenRouter", () => {
    expect(selectUpstream("deepseek/deepseek-v4.1-flash-1017", { fake, openrouter })).toBe(
      openrouter,
    );
    expect(selectUpstream("fakeish/model", { fake, openrouter })).toBe(openrouter);
  });
});
