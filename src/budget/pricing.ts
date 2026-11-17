/**
 * Model prices and the cost of a request's token usage. The price table doubles as the list of
 * models the gateway accepts.
 */

import type { Micros, ModelPrice, PriceTable, TokenUsage } from "./types.ts";

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Real model prices in micro-dollars per million tokens: OpenRouter's list prices on 2026-11-17.
 */
export const MODEL_PRICES: PriceTable = {
  "deepseek/deepseek-v4.1-flash-1017": { inputMicrosPerMTok: 36_000, outputMicrosPerMTok: 500_000 },
  "anthropic/claude-sonnet-5.5": { inputMicrosPerMTok: 2_000_000, outputMicrosPerMTok: 10_000_000 },
};

/**
 * The fake upstream's models, at $1 per million tokens so test costs are easy to read. Kept out
 * of MODEL_PRICES because the caller picks their token counts with x-fake-* headers.
 */
export const FAKE_MODEL_PRICES: PriceTable = {
  "fake/model": { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 1_000_000 },
};

/** The models the gateway accepts: the real ones, plus the fake ones when they're turned on. */
export function priceTable({ fakeModels }: { fakeModels: boolean }): PriceTable {
  return fakeModels ? { ...FAKE_MODEL_PRICES, ...MODEL_PRICES } : MODEL_PRICES;
}

/** The price for `model`, or undefined when the gateway doesn't accept that model. */
export function priceFor(prices: PriceTable, model: string): ModelPrice | undefined {
  // A plain index would also find inherited keys such as "toString".
  if (!Object.hasOwn(prices, model)) return undefined;
  return prices[model];
}

/** Cost of a token usage in micro-dollars, rounded up so the gateway never undercharges. */
export function costMicros(price: ModelPrice, usage: TokenUsage): Micros {
  const costTimesMillion =
    usage.inputTokens * price.inputMicrosPerMTok + usage.outputTokens * price.outputMicrosPerMTok;
  return Math.ceil(costTimesMillion / TOKENS_PER_MILLION);
}
