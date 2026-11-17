/**
 * Declares the admin usage view: GET /admin/usage returns the report as JSON behind the admin
 * key, and GET /admin serves a small HTML page that asks for the key and renders that JSON.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { weekStart } from "../budget/periods.ts";
import type { Clock } from "../budget/types.ts";
import { errorResponse } from "../errors.ts";
import { type UsageReport, usageReport } from "../reports/usage.ts";
import { createRouter } from "../router.ts";
import type { Store } from "../store/types.ts";
import { requireAdmin } from "./auth.ts";
import { USAGE_PAGE_HTML } from "./usage-page.ts";

/** What the usage routes need: the store to read from, the clock, and the configured key. */
export type UsageAdminDeps = {
  store: Store;
  clock: Clock;
  adminKey: string | undefined;
};

const micros = z.number().int();

const OverflowPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("block") }),
  z.object({ kind: z.literal("pool"), weeklyCapMicros: micros.nullable() }),
]);

const EmployeeUsageSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  tierId: z.string(),
  disabled: z.boolean(),
  spentTodayMicros: micros,
  dailyAllowanceMicros: micros,
  overflow: OverflowPolicySchema,
  poolDrawsThisWeekMicros: micros,
  spentThisWeekMicros: micros,
  blockedThisWeek: z.number().int(),
});

const ProjectUsageSchema = z.object({
  projectTag: z.string().nullable(),
  spentThisWeekMicros: micros,
  requests: z.number().int(),
  blockedRequests: z.number().int(),
});

const UsageReportSchema = z
  .object({
    asOf: z.iso.datetime(),
    dayResetsAt: z.iso.datetime(),
    weekResetsAt: z.iso.datetime(),
    company: z.object({
      id: z.string(),
      name: z.string(),
      spentThisWeekMicros: micros,
      weeklyPoolMicros: micros,
    }),
    employees: z.array(EmployeeUsageSchema),
    projects: z.array(ProjectUsageSchema),
  })
  .openapi("UsageReport");

/** The usage report as it goes over the wire: the same fields, with dates as ISO strings. */
type UsageReportJson = z.infer<typeof UsageReportSchema>;

/** The usage router (report and page), bound to its dependencies. */
export function usageRoutes(deps: UsageAdminDeps) {
  const getUsage = createRoute({
    method: "get",
    path: "/admin/usage",
    operationId: "getUsage",
    middleware: [requireAdmin(deps.adminKey)] as const,
    responses: {
      200: {
        description: "Spend per employee, per project and for the company, as of now",
        content: { "application/json": { schema: UsageReportSchema } },
      },
      401: errorResponse("Missing or wrong admin key, or ADMIN_KEY isn't configured"),
    },
  });

  const adminPage = createRoute({
    method: "get",
    path: "/admin",
    operationId: "adminPage",
    responses: {
      200: {
        description: "A static page that asks for the admin key and renders the usage report",
        content: { "text/html": { schema: z.string() } },
      },
    },
  });

  return createRouter()
    .openapi(getUsage, async (c) => c.json(toJson(await currentReport(deps)), 200))
    .openapi(adminPage, (c) => c.html(USAGE_PAGE_HTML, 200));
}

/** Reads what the report needs from the store and builds it at the clock's current time. */
async function currentReport({ store, clock }: UsageAdminDeps): Promise<UsageReport> {
  const now = clock();
  const company = await store.getCompany();
  return usageReport({
    company,
    tiers: await store.listTiers(),
    employees: await store.listEmployees(),
    usage: await store.listUsageSince(company.id, weekStart(now)),
    now,
  });
}

/** The report with its dates as ISO strings, matching the wire schema. */
function toJson(report: UsageReport): UsageReportJson {
  return {
    ...report,
    asOf: report.asOf.toISOString(),
    dayResetsAt: report.dayResetsAt.toISOString(),
    weekResetsAt: report.weekResetsAt.toISOString(),
  };
}
