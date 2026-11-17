/**
 * POST /admin/clock/advance, behind the admin key, mounted only when DEMO_CLOCK=1. It moves the
 * demo clock forward by a number of hours so a demo can cross 00:00 UTC or Monday.
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { DemoClock } from "../clock/demo-clock.ts";
import { errorResponse } from "../errors.ts";
import { createRouter } from "../router.ts";
import { requireAdmin } from "./auth.ts";

/** What the clock route needs. */
export type ClockAdminDeps = {
  demoClock: DemoClock;
  adminKey: string | undefined;
};

const MS_PER_HOUR = 3_600_000;
// Two weeks is enough to cross any daily or weekly reset in a demo.
const MAX_ADVANCE_HOURS = 24 * 14;

const AdvanceBody = z.object({ hours: z.number().positive().max(MAX_ADVANCE_HOURS) });

const ClockSchema = z.object({ now: z.iso.datetime() }).openapi("DemoClock");

/** The demo clock router, bound to its dependencies. */
export function clockRoutes(deps: ClockAdminDeps) {
  const advance = createRoute({
    method: "post",
    path: "/admin/clock/advance",
    operationId: "advanceDemoClock",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: {
      body: { required: true, content: { "application/json": { schema: AdvanceBody } } },
    },
    responses: {
      200: {
        description: "The demo clock's new time",
        content: { "application/json": { schema: ClockSchema } },
      },
      400: errorResponse("hours is missing, not positive, or more than two weeks"),
      401: errorResponse("Missing or wrong admin key, or ADMIN_KEY isn't configured"),
    },
  });

  return createRouter().openapi(advance, (c) => {
    const { hours } = c.req.valid("json");
    const now = deps.demoClock.advance(hours * MS_PER_HOUR);
    return c.json({ now: now.toISOString() }, 200);
  });
}
