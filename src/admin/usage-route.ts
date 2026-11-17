/**
 * Declares the admin usage view: GET /admin/usage returns the report as JSON behind the admin
 * key, and GET /admin serves a small HTML page that asks for the key and renders that JSON.
 */

import type { Clock } from "../budget/types.ts";
import { createRouter } from "../router.ts";
import type { Store } from "../store/types.ts";

/** What the admin routes need: the store to read from, the clock, and the configured key. */
export type AdminDeps = {
  store: Store;
  clock: Clock;
  adminKey: string | undefined;
};

/** The admin router, bound to its dependencies. */
export function adminRoutes(deps: AdminDeps) {
  return createRouter();
}
