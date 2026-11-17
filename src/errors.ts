/**
 * Defines the API's error codes, HTTP statuses and safe response envelope. The app and route
 * declarations share this policy for runtime responses and OpenAPI documentation.
 */

import { z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { formatUsd } from "./budget/money.ts";
import type { BlockDecision, BlockReason, Micros } from "./budget/types.ts";

/**
 * The one status table. Every error response comes from a row here, so a code always means the
 * same status and the same safe message.
 */
export const errorTable = {
  bad_request: { status: 400, message: "Invalid request." },
  unknown_model: { status: 400, message: "This model isn't available through the gateway." },
  unauthorized: { status: 401, message: "Missing or invalid API key." },
  not_found: { status: 404, message: "Resource not found." },
  payload_too_large: { status: 413, message: "Request body is too large." },
  unsupported_media_type: {
    status: 415,
    message: "Expected a JSON body. Send content-type: application/json.",
  },
  // The 429 message is built per request from the budget details; this one is the fallback.
  budget_exceeded: { status: 429, message: "Spend limit reached." },
  internal: { status: 500, message: "Internal server error." },
  upstream_unavailable: {
    status: 502,
    message:
      "The inference provider couldn't be reached. Try again shortly; if it keeps failing, give your admin the request id.",
  },
} as const;

export type ErrorCode = keyof typeof errorTable;
export type ErrorStatus = (typeof errorTable)[ErrorCode]["status"];

/** One field the validator rejected: where it is and why, never the value sent. */
export type Issue = { path: string; message: string };

/** What a 429 reports: which limit was hit, how much was spent against it, and when it resets. */
export type BudgetDetails = {
  reason: BlockReason;
  spentMicros: Micros;
  limitMicros: Micros;
  resetsAt: string;
};

type AppErrorDetails = {
  issues?: Issue[];
  budget?: BudgetDetails;
  /** Replaces the table's message. Only for messages built from safe, known values. */
  message?: string;
  cause?: unknown;
};

/** A failure the API reports on purpose. Throw a subclass; app.onError renders it. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly issues: Issue[] | undefined;
  readonly budget: BudgetDetails | undefined;

  constructor(code: ErrorCode, details: AppErrorDetails = {}) {
    super(details.message ?? errorTable[code].message, { cause: details.cause });
    this.name = new.target.name;
    this.code = code;
    this.issues = details.issues;
    this.budget = details.budget;
  }

  get status(): ErrorStatus {
    return errorTable[this.code].status;
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("not_found");
  }
}

export class BadRequestError extends AppError {
  constructor(issues?: Issue[]) {
    super("bad_request", issues ? { issues } : {});
  }
}

const MAX_ECHOED_MODEL = 100;

const UNAUTHORIZED_MESSAGES = {
  gateway: "Missing or invalid API key. Send your gateway key in the x-api-key header.",
  admin: "Missing or invalid admin key. Send it in the x-admin-key header.",
} as const;

/**
 * The request had no key, an unknown or revoked one, or the employee is disabled. The message
 * names the header to send, which differs for the gateway and the admin API.
 */
export class UnauthorizedError extends AppError {
  constructor(credential: keyof typeof UNAUTHORIZED_MESSAGES = "gateway") {
    super("unauthorized", { message: UNAUTHORIZED_MESSAGES[credential] });
  }
}

/** The requested model isn't in the price table, so the gateway can't cost it. */
export class UnknownModelError extends AppError {
  constructor(model: string, available: readonly string[]) {
    // The body allows any length of model id; quote enough to recognize it, not all of it.
    const shown =
      model.length > MAX_ECHOED_MODEL ? `${model.slice(0, MAX_ECHOED_MODEL)}...` : model;
    super("unknown_model", {
      message: `Model "${shown}" isn't available through the gateway. Use one of: ${available.join(", ")}.`,
    });
  }
}

/** The inference provider couldn't be reached, or isn't configured. Nothing is charged. */
export class UpstreamUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super("upstream_unavailable", { cause });
  }
}

const LIMIT_NAMES: Record<BlockReason, string> = {
  personal_allowance_exhausted: "Daily allowance",
  pool_cap_reached: "Weekly pool cap",
  company_pool_exhausted: "Company weekly pool",
};

/** A budget rule blocked the request. The message says which limit and when it resets. */
export class BudgetExceededError extends AppError {
  constructor(decision: BlockDecision) {
    const resetsAt = decision.resetsAt.toISOString();
    const limit = formatUsd(decision.limitMicros);
    super("budget_exceeded", {
      message: `${LIMIT_NAMES[decision.reason]} of ${limit} used. Resets ${resetsAt}.`,
      budget: {
        reason: decision.reason,
        spentMicros: decision.spentMicros,
        limitMicros: decision.limitMicros,
        resetsAt,
      },
    });
  }
}

export const IssueSchema = z.object({ path: z.string(), message: z.string() });

export const BudgetDetailsSchema = z.object({
  reason: z.enum(["company_pool_exhausted", "personal_allowance_exhausted", "pool_cap_reached"]),
  spentMicros: z.number().int(),
  limitMicros: z.number().int(),
  resetsAt: z.iso.datetime(),
});

export const ErrorEnvelope = z
  .object({
    error: z.object({
      code: z.enum(Object.keys(errorTable) as [ErrorCode, ...ErrorCode[]]),
      message: z.string(),
      requestId: z.string(),
      issues: z.array(IssueSchema).optional(),
      budget: BudgetDetailsSchema.optional(),
    }),
  })
  .openapi("Error");

export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** The OpenAPI response entry for an error status, so every route documents the same body. */
export function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelope } } };
}

function codeForStatus(status: number): ErrorCode {
  const row = Object.entries(errorTable).find(([, value]) => value.status === status);
  return (row?.[0] as ErrorCode | undefined) ?? "internal";
}

/**
 * Maps anything thrown to an AppError. Hono's own HTTPExceptions (malformed JSON, a missing
 * content type, the body limit) keep their status when the table has a row for it; anything else
 * is an internal error whose message never reaches the client.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof HTTPException) return new AppError(codeForStatus(error.status));
  return new AppError("internal");
}

export function envelope(error: AppError, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.issues ? { issues: error.issues } : {}),
      ...(error.budget ? { budget: error.budget } : {}),
    },
  };
}
