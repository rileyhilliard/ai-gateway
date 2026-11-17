/**
 * Forwards requests to OpenRouter's Anthropic Messages endpoint with the company key, and
 * reads token usage and OpenRouter's reported cost from the response. A streaming answer is
 * handed back unread; the gateway reads its usage as the events pass through.
 */

import { providerCostToMicros } from "../budget/money.ts";
import type { Micros, TokenUsage } from "../budget/types.ts";
import { UpstreamUnavailableError } from "../errors.ts";
import type { Upstream, UpstreamRequest, UpstreamResponse, UpstreamStream } from "./types.ts";

const DEFAULT_BASE_URL = "https://openrouter.ai/api";
// Long, non-streaming generations can take minutes; this only stops a provider that stalls.
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
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
  return providerCostToMicros(usage.cost);
}

/**
 * An upstream that sends each request to OpenRouter. A missing key fails per request.
 *
 * @throws {UpstreamUnavailableError} From `send` and `stream`, when there is no API key, the
 * fetch or a full body read fails, the provider takes longer than `timeoutMs` (for `stream`,
 * to start answering), or OpenRouter refuses the company key or account (401, 402). The
 * original failure, or what to fix, is the `cause`.
 */
export function createOpenRouterUpstream(options: OpenRouterOptions): Upstream {
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
      // The timeout covers everything up to the start of an event stream, and nothing after it:
      // a long generation can stream for longer, and the client cancelling still closes the
      // connection. Any other answer is read in full under the timeout, like `send`.
      const timeout = new AbortController();
      const timer = setTimeout(
        () => timeout.abort(new DOMException("OpenRouter didn't answer in time", "TimeoutError")),
        timeoutMs,
      );
      try {
        const response = await post(request, timeout.signal);
        if (response.ok && response.body !== null && isEventStream(response)) {
          return { kind: "stream", status: response.status, events: response.body };
        }
        return await readFullResponse(response);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Whether the provider answered with server-sent events, rather than JSON for a 2xx. */
function isEventStream(response: Response): boolean {
  return response.headers.get("content-type")?.startsWith("text/event-stream") ?? false;
}

/**
 * Why OpenRouter refused the company's account, for statuses that are the company's problem
 * rather than the employee's. Passed through, Claude Code would report a 401 as the employee's
 * key being bad. 403 isn't here: OpenRouter uses it for input its moderation flagged.
 */
const ACCOUNT_ERRORS = new Map([
  [401, "OpenRouter rejected the company key (401); check OPENROUTER_KEY."],
  [402, "OpenRouter account is out of credits (402); add credits on openrouter.ai."],
]);

// Statuses where the provider asks clients to back off; Anthropic SDKs honor retry-after.
const RETRY_AFTER_STATUSES = new Set([429, 529]);

/**
 * Reads the whole body and its usage. The body is read even for an account error, so the
 * connection is released before the error is thrown.
 *
 * @throws {UpstreamUnavailableError} When the connection drops or times out while reading, or
 * OpenRouter refuses the company account (401, 402); the cause says which and what to fix.
 */
async function readFullResponse(response: Response): Promise<UpstreamResponse> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    throw new UpstreamUnavailableError(cause);
  }
  const accountError = ACCOUNT_ERRORS.get(response.status);
  if (accountError) throw new UpstreamUnavailableError(new Error(accountError));

  const parsedBody = parseBody(text);
  const usage = usageObjectOf(parsedBody);
  const retryAfter = response.headers.get("retry-after");
  return {
    status: response.status,
    body: parsedBody,
    usage: readTokenUsage(usage),
    costMicros: readCostMicros(usage),
    ...(RETRY_AFTER_STATUSES.has(response.status) && retryAfter !== null ? { retryAfter } : {}),
  };
}
