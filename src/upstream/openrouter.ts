/**
 * Forwards requests to OpenRouter's Anthropic Messages endpoint with the company key, and
 * reads token usage and OpenRouter's reported cost from the response.
 */

import type { Micros, TokenUsage } from "../budget/types.ts";
import { UpstreamUnavailableError } from "../errors.ts";
import type { Upstream, UpstreamRequest, UpstreamResponse } from "./types.ts";

const DEFAULT_BASE_URL = "https://openrouter.ai/api";
const MICROS_PER_DOLLAR = 1_000_000;
const FORWARDED_HEADERS = ["anthropic-version", "anthropic-beta"];

/** How to reach OpenRouter. `fetch` is passed in so tests never touch the network. */
export type OpenRouterOptions = {
  apiKey: string | undefined;
  fetch: typeof fetch;
  /** Defaults to https://openrouter.ai/api. */
  baseUrl?: string;
};

/** The headers OpenRouter gets: our key, the content type, and the incoming anthropic-* headers. */
function outgoingHeaders(apiKey: string, incoming: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  for (const name of FORWARDED_HEADERS) {
    const value = incoming[name];
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}

/** The body parsed as JSON, or the raw text when it isn't JSON (a gateway error page, say). */
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The `usage` object of a parsed body, or null when there isn't one. */
function usageObjectOf(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || !("usage" in body)) return null;
  const { usage } = body;
  if (typeof usage !== "object" || usage === null) return null;
  return usage as Record<string, unknown>;
}

function readTokenUsage(usage: Record<string, unknown> | null): TokenUsage | null {
  if (usage === null) return null;
  const { input_tokens: inputTokens, output_tokens: outputTokens } = usage;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  return { inputTokens, outputTokens };
}

/** OpenRouter's reported cost in whole micro-dollars, rounded up, or null when absent. */
function readCostMicros(usage: Record<string, unknown> | null): Micros | null {
  if (usage === null || typeof usage.cost !== "number") return null;
  return Math.ceil(usage.cost * MICROS_PER_DOLLAR);
}

/**
 * An upstream that sends each request to OpenRouter. A missing key fails per request.
 *
 * @throws {UpstreamUnavailableError} From `send`, when there is no API key or the fetch rejects.
 */
export function createOpenRouterUpstream(options: OpenRouterOptions): Upstream {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async send({ body, headers }: UpstreamRequest): Promise<UpstreamResponse> {
      if (!options.apiKey) throw new UpstreamUnavailableError();

      let response: Response;
      try {
        response = await options.fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: outgoingHeaders(options.apiKey, headers),
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new UpstreamUnavailableError(cause);
      }

      const parsedBody = parseBody(await response.text());
      const usage = usageObjectOf(parsedBody);
      return {
        status: response.status,
        body: parsedBody,
        usage: readTokenUsage(usage),
        costMicros: readCostMicros(usage),
      };
    },
  };
}
