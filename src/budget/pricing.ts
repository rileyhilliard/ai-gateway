/**
 * Model prices and the cost of a request's token usage. The price table doubles as the list of
 * models the gateway accepts.
 */

import type { Micros, ModelPrice, PriceTable, TokenUsage } from "./types.ts";

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Prices in micro-dollars per million tokens. Real models use OpenRouter's list prices on
 * 2026-11-17. `fake/model` is priced at $1 per million tokens so test costs are easy to read.
 */
export const DEFAULT_PRICES: PriceTable = {
  "fake/model": { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 1_000_000 },
  "deepseek/deepseek-v4.1-flash-1017": { inputMicrosPerMTok: 36_000, outputMicrosPerMTok: 500_000 },
  "anthropic/claude-sonnet-5.5": { inputMicrosPerMTok: 2_000_000, outputMicrosPerMTok: 10_000_000 },
};

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
