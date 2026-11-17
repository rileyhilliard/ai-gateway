/**
 * Defines the in-process MSW gateway used by Vitest's client and component tests. The default
 * handler serves the usage fixture, and individual tests can override responses.
 */

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { usageReport } from "../fixtures/usage";

/** The API base tests use: the app's default, a same-origin path. */
export const TEST_API_URL = "/api";

/** The fake gateway's default answers. A test changes one with server.use(...) for its own case. */
export const handlers = [http.get("*/api/admin/usage", () => HttpResponse.json(usageReport))];

export const server = setupServer(...handlers);
