/**
 * The admin write API: set the company's weekly pool, move an employee to another tier, set or
 * clear their overrides, and revoke or reissue their gateway key. Inputs are in dollars and are
 * stored as micro-dollars; responses are in micro-dollars, like the usage view. Every route sits
 * behind the admin key, and each change applies from the next request on.
 */

import { createRouter } from "../router.ts";
import type { Store } from "../store/types.ts";

/** What the budget admin routes need. `newApiKey` is the only source of new keys. */
export type BudgetAdminDeps = {
  store: Store;
  adminKey: string | undefined;
  newApiKey: () => string;
};

/** The budget admin router, bound to its dependencies. */
export function budgetRoutes(deps: BudgetAdminDeps) {
  return createRouter();
}
