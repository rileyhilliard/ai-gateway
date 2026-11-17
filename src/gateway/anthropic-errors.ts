/**
 * Errors on the gateway's Anthropic-compatible endpoints (`/v1/*`) in Anthropic's own shape, so
 * the Anthropic SDKs and tools like Claude Code raise their typed errors (a budget block becomes
 * a `RateLimitError` carrying our message). The gateway's code, issues and budget details ride
 * along inside `error`. Admin and health routes keep the app's own envelope from errors.ts.
 */

import { z } from "@hono/zod-openapi";
import {
  type AppError,
  BudgetDetailsSchema,
  type ErrorCode,
  errorTable,
  IssueSchema,
} from "../errors.ts";

/** Anthropic's error types, as its API and SDKs name them. */
export const ANTHROPIC_ERROR_TYPES = [
  "invalid_request_error",
  "authentication_error",
  "not_found_error",
  "request_too_large",
  "rate_limit_error",
  "api_error",
] as const;

export type AnthropicErrorType = (typeof ANTHROPIC_ERROR_TYPES)[number];

/** The error body for `/v1/*`: Anthropic's shape plus the gateway's code and details. */
export const AnthropicErrorBody = z
  .object({
    type: z.literal("error"),
    error: z.object({
      type: z.enum(ANTHROPIC_ERROR_TYPES),
      message: z.string(),
      code: z.enum(Object.keys(errorTable) as [ErrorCode, ...ErrorCode[]]),
      issues: z.array(IssueSchema).optional(),
      budget: BudgetDetailsSchema.optional(),
    }),
    request_id: z.string(),
  })
  .openapi("AnthropicError");

export type AnthropicErrorBody = z.infer<typeof AnthropicErrorBody>;

/** The Anthropic error type a client should see for one of the gateway's error codes. */
export function anthropicErrorType(code: ErrorCode): AnthropicErrorType {
  throw new Error("not implemented");
}

/** Renders an AppError as the `/v1/*` error body. */
export function toAnthropicError(error: AppError, requestId: string): AnthropicErrorBody {
  throw new Error("not implemented");
}

/** The OpenAPI response entry for an error status on a `/v1/*` route. */
export function anthropicErrorResponse(description: string) {
  return { description, content: { "application/json": { schema: AnthropicErrorBody } } };
}
