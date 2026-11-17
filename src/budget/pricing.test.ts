/**
 * Pricing: the cost of a request's token usage in micro-dollars, and which models the gateway
 * accepts.
 */

import { describe, expect, it } from "vitest";
import { costMicros, MODEL_PRICES, priceFor, priceTable } from "./pricing.ts";

describe("costMicros", () => {
  it("charges a million input tokens at the per-million input price", () => {
    const price = { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 };
    expect(costMicros(price, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(3_000_000);
  });

  it("prices input and output tokens separately", () => {
    const price = { inputMicrosPerMTok: 2_000_000, outputMicrosPerMTok: 10_000_000 };
    // 1,000 input at $2/M is 2,000 micros; 500 output at $10/M is 5,000 micros.
    expect(costMicros(price, { inputTokens: 1_000, outputTokens: 500 })).toBe(7_000);
  });

  it("rounds a fraction of a micro-dollar up, so the gateway never undercharges", () => {
    const price = { inputMicrosPerMTok: 1, outputMicrosPerMTok: 1 };
    expect(costMicros(price, { inputTokens: 1, outputTokens: 0 })).toBe(1);
  });

  it("charges nothing for zero tokens", () => {
    const price = { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 1_000_000 };
    expect(costMicros(price, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("priceFor", () => {
  it("returns the price of an accepted model", () => {
    expect(priceFor(priceTable({ fakeModels: true }), "fake/model")).toEqual({
      inputMicrosPerMTok: 1_000_000,
      outputMicrosPerMTok: 1_000_000,
    });
    expect(priceFor(MODEL_PRICES, "deepseek/deepseek-v4.1-flash-1017")).toBeDefined();
  });

  it("returns undefined for a model the gateway doesn't accept", () => {
    expect(priceFor(MODEL_PRICES, "openai/gpt-unknown")).toBeUndefined();
  });

  it("doesn't treat inherited object keys as models", () => {
    expect(priceFor(MODEL_PRICES, "toString")).toBeUndefined();
  });
});

describe("priceTable", () => {
  it("accepts fake/ models only when they're turned on", () => {
    expect(priceFor(priceTable({ fakeModels: false }), "fake/model")).toBeUndefined();
    expect(priceFor(priceTable({ fakeModels: true }), "fake/model")).toBeDefined();
  });

  it("keeps the real models either way", () => {
    for (const fakeModels of [true, false]) {
      expect(priceTable({ fakeModels })).toMatchObject(MODEL_PRICES);
    }
  });

  it("never lists a fake/ model among the real ones", () => {
    expect(Object.keys(MODEL_PRICES).filter((model) => model.startsWith("fake/"))).toEqual([]);
  });
});
