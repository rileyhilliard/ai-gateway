/**
 * Checks API error retry decisions and the messages shown by the UI. These tables pin the
 * policy shared by the query client and error display.
 */

import { expect, test } from "vitest";
import { ApiError, isRetryable, userMessage } from "./errors";

const http = (status: number) => new ApiError({ kind: "http", path: "/items", status });

test.each([
  [new ApiError({ kind: "network", path: "/items" }), true],
  [http(503), true],
  [http(429), true],
  [http(500), false],
  [http(404), false],
  [new ApiError({ kind: "decode", path: "/items", status: 200 }), false],
  [new Error("not an ApiError"), false],
])("isRetryable(%s) is %s", (error, expected) => {
  expect(isRetryable(error)).toBe(expected);
});

test.each([
  [new ApiError({ kind: "network", path: "/items" }), "Can't reach the gateway"],
  [http(502), "Can't reach the gateway"],
  [http(504), "Can't reach the gateway"],
  [new ApiError({ kind: "decode", path: "/items", status: 200 }), "can't read"],
  [http(401), "Set ADMIN_KEY (8+ characters) in the repo's .env"],
  [http(500), "The gateway answered with HTTP 500."],
  [http(404), "The gateway answered with HTTP 404."],
  ["thrown string", "Something went wrong."],
])("userMessage(%s) says %s", (error, expected) => {
  expect(userMessage(error)).toContain(expected);
});
