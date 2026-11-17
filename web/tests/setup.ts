/**
 * Installs DOM matchers and the MSW lifecycle for Vitest's browser-like tests. It cleans
 * rendered components and resets request handlers after each test.
 */

import nodeConsole from "node:console";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// happy-dom prints what a browser's devtools would: "GET <url> 503 (Service Unavailable)" for
// every non-2xx fetch, and the TypeError behind MSW's HttpResponse.error(). Tests cause both on
// purpose and assert on the result, so they are dropped. happy-dom writes to Node's own console,
// which Vitest's onConsoleLog never sees, hence the filter here. Every other error still prints.
const FAILED_FETCH_LINE = /^[A-Z]+ \S+ \d{3} \(.*\)$/;
const printError = nodeConsole.error;

function isExpectedFetchFailure(first: unknown): boolean {
  if (typeof first === "string") return FAILED_FETCH_LINE.test(first);
  return first instanceof TypeError && first.message === "Network error";
}

// A request no handler answers fails the test instead of reaching the network.
beforeAll(() => {
  nodeConsole.error = (...args: unknown[]) => {
    if (!isExpectedFetchFailure(args[0])) printError(...args);
  };
  server.listen({ onUnhandledFrame: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
  nodeConsole.error = printError;
});
