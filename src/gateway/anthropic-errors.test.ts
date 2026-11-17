/**
 * Which Anthropic error type each gateway error code becomes, and the body built from it.
 */

import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  BudgetExceededError,
  type ErrorCode,
  errorTable,
} from "../errors.ts";
import { anthropicErrorType, toAnthropicError } from "./anthropic-errors.ts";

describe("anthropicErrorType", () => {
  it.each<[ErrorCode, string]>([
    ["bad_request", "invalid_request_error"],
    ["unknown_model", "invalid_request_error"],
    ["unsupported_media_type", "invalid_request_error"],
    ["unauthorized", "authentication_error"],
    ["not_found", "not_found_error"],
    ["payload_too_large", "request_too_large"],
    ["budget_exceeded", "rate_limit_error"],
    ["internal", "api_error"],
    ["upstream_unavailable", "api_error"],
  ])("maps %s to %s", (code, type) => {
    expect(anthropicErrorType(code)).toBe(type);
  });

  it("has a mapping for every code in the error table", () => {
    for (const code of Object.keys(errorTable) as ErrorCode[]) {
      expect(() => anthropicErrorType(code)).not.toThrow();
    }
  });
});

describe("toAnthropicError", () => {
  it("puts the type, message and code under error and the request id at the top", () => {
    expect(toAnthropicError(new AppError("unauthorized"), "req-1")).toEqual({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Missing or invalid API key.",
        code: "unauthorized",
      },
      request_id: "req-1",
    });
  });

  it("keeps validation issues", () => {
    const issues = [{ path: "json.model", message: "Required" }];
    expect(toAnthropicError(new BadRequestError(issues), "req-2").error.issues).toEqual(issues);
  });

  it("keeps the budget details and the per-request message of a block", () => {
    const block = new BudgetExceededError({
      kind: "block",
      reason: "personal_allowance_exhausted",
      spentMicros: 11_000,
      limitMicros: 10_000,
      resetsAt: new Date("2026-11-19T00:00:00.000Z"),
    });
    expect(toAnthropicError(block, "req-3").error).toEqual({
      type: "rate_limit_error",
      message: "Daily allowance of $0.01 used. Resets 2026-11-19T00:00:00.000Z.",
      code: "budget_exceeded",
      budget: {
        reason: "personal_allowance_exhausted",
        spentMicros: 11_000,
        limitMicros: 10_000,
        resetsAt: "2026-11-19T00:00:00.000Z",
      },
    });
  });
});
