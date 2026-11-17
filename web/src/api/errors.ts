/**
 * Defines typed API failures and their shared retry and user-message policies. The fetch
 * client creates these errors and the query cache and UI decide how to handle them.
 */

/**
 * Every failed API call rejects with an ApiError:
 *   http     the API answered with a non-2xx status
 *   network  no response (offline, DNS, CORS, the server is down)
 *   decode   a 2xx response whose body isn't JSON or doesn't match the schema
 */
export type ApiErrorKind = "http" | "network" | "decode";

export type ApiErrorDetails = {
  kind: ApiErrorKind;
  path: string;
  status?: number | undefined;
  /** The API's x-request-id response header, shown to the user so a report can be traced. */
  requestId?: string | undefined;
};

export class ApiError extends Error {
  override name = "ApiError";
  readonly kind: ApiErrorKind;
  readonly path: string;
  readonly status: number | undefined;
  readonly requestId: string | undefined;

  constructor(details: ApiErrorDetails, options?: ErrorOptions) {
    const status = details.status === undefined ? "" : ` (${details.status})`;
    super(`${details.kind} error for ${details.path}${status}`, options);
    this.kind = details.kind;
    this.path = details.path;
    this.status = details.status;
    this.requestId = details.requestId;
  }
}

const TRANSIENT = new Set([408, 429, 502, 503, 504]);

/** Worth retrying: no response at all, or a status that says "try again later". */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.kind === "network" || (error.status !== undefined && TRANSIENT.has(error.status));
}

// Vite's dev proxy answers 502 when the gateway behind it refuses the connection.
const GATEWAY_DOWN = new Set([502, 504]);

/** The sentence the UI shows for a failure. Never the raw error message or response body. */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  if (error.kind === "network" || (error.status !== undefined && GATEWAY_DOWN.has(error.status))) {
    return "Can't reach the gateway. Is bun dev running?";
  }
  if (error.kind === "decode") return "The gateway sent a report this dashboard can't read.";
  if (error.status === 401) {
    return "The gateway rejected the admin key. Set ADMIN_KEY (8+ characters) in the repo's .env and restart bun dev.";
  }
  return `The gateway answered with HTTP ${error.status}.`;
}
