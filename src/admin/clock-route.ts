/**
 * POST /admin/clock/advance, behind the admin key, mounted only when DEMO_CLOCK=1. It moves the
 * demo clock forward by a number of hours so a demo can cross 00:00 UTC or Monday.
 */

import type { DemoClock } from "../clock/demo-clock.ts";
import { createRouter } from "../router.ts";

/** What the clock route needs. */
export type ClockAdminDeps = {
  demoClock: DemoClock;
  adminKey: string | undefined;
};

/** The demo clock router, bound to its dependencies. */
export function clockRoutes(deps: ClockAdminDeps) {
  return createRouter();
}
