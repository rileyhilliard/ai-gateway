/**
 * Checks conversion of application, Hono and unexpected errors into the shared API error
 * policy. Envelope assertions keep optional validation issues and safe messages consistent.
 */

import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  BudgetExceededError,
  envelope,
  NotFoundError,
  toAppError,
} from "./errors.ts";

describe("toAppError", () => {
  it("keeps an AppError as it is", () => {
    const error = new NotFoundError();
    expect(toAppError(error)).toBe(error);
    expect(error.status).toBe(404);
  });

  it.each([
    [400, "bad_request"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
    [403, "internal"],
  ] as const)("maps Hono's HTTPException %i to %s", (status, code) => {
    expect(toAppError(new HTTPException(status)).code).toBe(code);
  });

  it("hides anything else behind the internal row", () => {
    const error = toAppError(new Error("secret detail"));
    expect(error.code).toBe("internal");
    expect(error.message).toBe("Internal server error.");
  });
});

describe("envelope", () => {
  it("carries issues only when there are some", () => {
    expect(envelope(new AppError("not_found"), "r1")).toEqual({
      error: { code: "not_found", message: "Resource not found.", requestId: "r1" },
    });
    const issues = [{ path: "json.title", message: "Required" }];
    expect(envelope(new BadRequestError(issues), "r2").error.issues).toEqual(issues);
  });
});

describe("BudgetExceededError", () => {
  it("names the limit, its amount and the reset time, and carries the budget details", () => {
    const error = new BudgetExceededError({
      kind: "block",
      reason: "personal_allowance_exhausted",
      spentMicros: 510_000,
      limitMicros: 500_000,
      resetsAt: new Date("2026-11-19T00:00:00.000Z"),
    });
    expect(error.status).toBe(429);
    expect(envelope(error, "r3")).toEqual({
      error: {
        code: "budget_exceeded",
        message: "Daily allowance of $0.50 used. Resets 2026-11-19T00:00:00.000Z.",
        requestId: "r3",
        budget: {
          reason: "personal_allowance_exhausted",
          spentMicros: 510_000,
          limitMicros: 500_000,
          resetsAt: "2026-11-19T00:00:00.000Z",
        },
      },
    });
  });

  it.each([
    ["pool_cap_reached", "Weekly pool cap of $0.02 used."],
    ["company_pool_exhausted", "Company weekly pool of $0.02 used."],
  ] as const)("words the %s message", (reason, start) => {
    const error = new BudgetExceededError({
      kind: "block",
      reason,
      spentMicros: 20_000,
      limitMicros: 20_000,
      resetsAt: new Date("2026-11-23T00:00:00.000Z"),
    });
    expect(error.message.startsWith(start)).toBe(true);
  });
});
