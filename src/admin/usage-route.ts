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

/** What the admin routes need: the store to read from, the clock, and the configured key. */
export type AdminDeps = {
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

// Static on purpose: the page holds no data and no key, so it is safe to serve without auth.
// Every value from the JSON is written with textContent, never parsed as HTML.
const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Spend gateway usage</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; margin-top: 1rem; }
  th, td { border: 1px solid #ccc; padding: 0.3rem 0.6rem; text-align: left; }
  .disabled { color: #999; }
  #status { color: #b00; }
</style>
</head>
<body>
<h1>Usage</h1>
<form id="keyForm">
  <label>Admin key <input id="key" type="password" autocomplete="off"></label>
  <button type="submit">Load usage</button>
</form>
<p id="status"></p>
<p id="company"></p>
<table hidden id="table">
  <thead><tr>
    <th>Employee</th><th>Tier</th><th>Today / allowance</th>
    <th>Pool draws / cap</th><th>Blocked this week</th>
  </tr></thead>
  <tbody id="rows"></tbody>
</table>
<table hidden id="projectTable">
  <thead><tr>
    <th>Project</th><th>Spent this week</th><th>Requests</th><th>Blocked this week</th>
  </tr></thead>
  <tbody id="projectRows"></tbody>
</table>
<script>
  const keyInput = document.getElementById("key");
  const status = document.getElementById("status");
  keyInput.value = sessionStorage.getItem("adminKey") || "";

  const dollars = (micros) => (micros / 1e6).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
  });

  function poolColumn(row) {
    if (row.overflow.kind === "block") return "blocked after allowance";
    const cap = row.overflow.weeklyCapMicros;
    return dollars(row.poolDrawsThisWeekMicros) + " / " + (cap === null ? "uncapped" : dollars(cap));
  }

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function render(report) {
    const company = report.company;
    document.getElementById("company").textContent =
      company.name + ": " + dollars(company.spentThisWeekMicros) + " / " +
      dollars(company.weeklyPoolMicros) + " pool this week. Day resets " +
      report.dayResetsAt + ", week resets " + report.weekResetsAt + ".";
    const rows = document.getElementById("rows");
    rows.replaceChildren();
    for (const row of report.employees) {
      const tr = document.createElement("tr");
      if (row.disabled) tr.className = "disabled";
      tr.append(
        cell(row.name + (row.disabled ? " (disabled)" : "")),
        cell(row.tierId),
        cell(dollars(row.spentTodayMicros) + " / " + dollars(row.dailyAllowanceMicros)),
        cell(poolColumn(row)),
        cell(String(row.blockedThisWeek)),
      );
      rows.append(tr);
    }
    document.getElementById("table").hidden = false;
    renderProjects(report.projects);
  }

  function renderProjects(projects) {
    const rows = document.getElementById("projectRows");
    rows.replaceChildren();
    for (const row of projects) {
      const tr = document.createElement("tr");
      tr.append(
        cell(row.projectTag === null ? "(no project)" : row.projectTag),
        cell(dollars(row.spentThisWeekMicros)),
        cell(String(row.requests)),
        cell(String(row.blockedRequests)),
      );
      rows.append(tr);
    }
    document.getElementById("projectTable").hidden = false;
  }

  async function load() {
    sessionStorage.setItem("adminKey", keyInput.value);
    status.textContent = "";
    const res = await fetch("/admin/usage", { headers: { "x-admin-key": keyInput.value } });
    if (res.status === 401) { status.textContent = "Admin key rejected, or ADMIN_KEY isn't set on the server."; return; }
    if (!res.ok) { status.textContent = "Couldn't load usage (HTTP " + res.status + ")."; return; }
    render(await res.json());
  }

  document.getElementById("keyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    load().catch((error) => { status.textContent = "Couldn't load usage: " + error.message; });
  });
</script>
</body>
</html>
`;

/** The admin router, bound to its dependencies. */
export function adminRoutes(deps: AdminDeps) {
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
    .openapi(adminPage, (c) => c.html(ADMIN_PAGE, 200));
}

/** Reads what the report needs from the store and builds it at the clock's current time. */
async function currentReport({ store, clock }: AdminDeps): Promise<UsageReport> {
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
