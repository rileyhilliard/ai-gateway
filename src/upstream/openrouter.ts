/**
 * Forwards requests to OpenRouter's Anthropic Messages endpoint with the company key, and
 * reads token usage and OpenRouter's reported cost from the response. A streaming answer is
 * handed back unread; the gateway reads its usage as the events pass through.
 */

import type { Micros, TokenUsage } from "../budget/types.ts";
import { UpstreamUnavailableError } from "../errors.ts";
import type {
  StreamingUpstream,
  UpstreamRequest,
  UpstreamResponse,
  UpstreamStream,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://openrouter.ai/api";
// Long, non-streaming generations can take minutes; this only stops a provider that stalls.
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MICROS_PER_DOLLAR = 1_000_000;
const FORWARDED_HEADERS = ["anthropic-version", "anthropic-beta"];

/** How to reach OpenRouter. `fetch` is passed in so tests never touch the network. */
export type OpenRouterOptions = {
  apiKey: string | undefined;
  fetch: typeof fetch;
  /** Defaults to https://openrouter.ai/api. */
  baseUrl?: string;
  /**
   * How long to wait for the whole response (a stream: for it to start) before giving up.
   * Defaults to 5 minutes.
   */
  timeoutMs?: number;
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
 * @throws {UpstreamUnavailableError} From `send` and `stream`, when there is no API key, the
 * fetch or a full body read fails, or the provider takes longer than `timeoutMs` (for `stream`,
 * to start answering). The original failure is the `cause`.
 */
export function createOpenRouterUpstream(options: OpenRouterOptions): StreamingUpstream {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Posts the request; `signal` bounds the call, and for `send` the body read after it. */
  async function post({ body, headers }: UpstreamRequest, signal: AbortSignal): Promise<Response> {
    if (!options.apiKey) {
      throw new UpstreamUnavailableError(new Error("OPENROUTER_KEY is not set"));
    }
    try {
      return await options.fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: outgoingHeaders(options.apiKey, headers),
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      throw new UpstreamUnavailableError(cause);
    }
  }

  return {
    async send(request: UpstreamRequest): Promise<UpstreamResponse> {
      return readFullResponse(await post(request, AbortSignal.timeout(timeoutMs)));
    },

    async stream(request: UpstreamRequest): Promise<UpstreamResponse | UpstreamStream> {
      // The timeout only covers the wait for the response to start: a long generation can keep
      // streaming for longer than it, and the client cancelling still closes the connection.
      const startTimeout = new AbortController();
      const timer = setTimeout(
        () =>
          startTimeout.abort(
            new DOMException("OpenRouter didn't start answering in time", "TimeoutError"),
          ),
        timeoutMs,
      );
      let response: Response;
      try {
        response = await post(request, startTimeout.signal);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok || response.body === null) return readFullResponse(response);
      return { kind: "stream", status: response.status, events: response.body };
    },
  };
}

/**
 * Reads the whole body and its usage.
 *
 * @throws {UpstreamUnavailableError} When the connection drops or times out while reading.
 */
async function readFullResponse(response: Response): Promise<UpstreamResponse> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    throw new UpstreamUnavailableError(cause);
  }
  const parsedBody = parseBody(text);
  const usage = usageObjectOf(parsedBody);
  return {
    status: response.status,
    body: parsedBody,
    usage: readTokenUsage(usage),
    costMicros: readCostMicros(usage),
  };
}
