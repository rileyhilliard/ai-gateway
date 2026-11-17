/**
 * Renders the dashboard at "/" against a fake gateway (MSW) and checks what the executive
 * reads: the pool's pace, who drives spend, who is at their limit, spend by project, and the
 * loading, error and stale states. Polling runs on fake interval timers, never sleeps.
 */

import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { emptyUsageReport, usageReport } from "../../../tests/fixtures/usage";
import { server } from "../../../tests/msw/server";
import { renderRoute } from "../../../tests/render";
import type { UsageReport } from "../../api/usage";

const answerWith = (report: UsageReport) =>
  server.use(http.get("*/api/admin/usage", () => HttpResponse.json(report)));

async function renderDashboard() {
  renderRoute("/");
  await screen.findByRole("heading", { level: 1, name: "Acme Corp" });
}

const region = (name: string) => screen.getByRole("region", { name });

const rowTexts = (container: HTMLElement, role: "row" | "listitem") =>
  within(container)
    .getAllByRole(role)
    .map((row) => row.textContent);

afterEach(() => {
  vi.useRealTimers();
});

describe("header", () => {
  test("names the company, the week's dates and when the pool resets", async () => {
    await renderDashboard();
    expect(screen.getByText("AI spend")).toBeVisible();
    expect(screen.getByText("Week of 16–22 Nov · resets Mon 00:00 UTC, in 4d 9h")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/^Live, updated \d+ s ago$/);
  });
});

const paceStatus = (title: string) => within(region("Weekly pool")).getByText(title).parentElement;

describe("pool panel: are we on track for this week's pool?", () => {
  test("shows spent against the pool, the percent used and the on-pace projection", async () => {
    await renderDashboard();
    const pool = region("Weekly pool");
    expect(within(pool).getByText("$0.0660")).toBeVisible();
    expect(within(pool).getByText("of $1.00")).toBeVisible();
    expect(within(pool).getByText("7% used")).toBeVisible();
    expect(
      within(pool).getByRole("img", {
        name: "Pool used: $0.0660 of $1.00 (7%). 37% of the week has gone. Projected $0.1787 by Monday.",
      }),
    ).toBeVisible();
    expect(paceStatus("On pace")).toHaveTextContent(
      "On pace projected $0.1787 by Monday, 18% of the pool",
    );
  });

  test("labels today, the projection and the pool's end on the bar itself", async () => {
    await renderDashboard();
    const pool = region("Weekly pool");
    expect(within(pool).getByText("Today, 37% of the week")).toBeVisible();
    expect(within(pool).getByText("Projected $0.1787")).toBeVisible();
    expect(within(pool).getByText("$1.00 pool")).toBeVisible();
  });

  test("folds pool left, active people and blocked requests into the panel", async () => {
    await renderDashboard();
    const pool = region("Weekly pool");
    expect(pool).toHaveTextContent("$0.9340 left in the pool");
    expect(pool).toHaveTextContent("3 of 4 people active");
    expect(pool).toHaveTextContent("4 blocked requests");
  });

  test("warns when spend is running ahead of the week", async () => {
    answerWith({
      ...usageReport,
      company: { ...usageReport.company, spentThisWeekMicros: 500_000 },
    });
    await renderDashboard();
    expect(paceStatus("Over pace")).toHaveTextContent(
      "Over pace projected $1.35 by Monday, 135% of the pool",
    );
    expect(within(region("Weekly pool")).getByText("Heading for $1.35")).toBeVisible();
  });

  test("holds off projecting in the first minutes of the week", async () => {
    answerWith({ ...usageReport, asOf: "2026-11-16T01:00:00.000Z" });
    await renderDashboard();
    expect(paceStatus("Too early to project")).toHaveTextContent(
      "Too early to project less than 2% of the week has gone",
    );
  });

  test("says so when the pool is already spent", async () => {
    answerWith({
      ...usageReport,
      company: { ...usageReport.company, spentThisWeekMicros: 1_000_000 },
    });
    await renderDashboard();
    expect(paceStatus("Pool spent")).toHaveTextContent(
      "Pool spent every request is blocked until Mon 00:00 UTC",
    );
  });
});

describe("people table: who drives the spend?", () => {
  test("ranks everyone by cost with their share of spend, allowance used today, pool draws and status", async () => {
    await renderDashboard();
    const table = within(region("People")).getByRole("table");
    expect(rowTexts(table, "row")).toEqual([
      "NameTierCost this weekAllowance used todayPool draws this weekBlockedStatus",
      "Eliengineer$0.032048%$0.0100 / $0.0100$0.0220 / $0.02001At limit",
      "Samstaff$0.023035%$0.0230 / $0.0500$0.00 / uncapped0",
      "Ivyintern$0.011017%$0.0110 / $0.0100–Blocks after allowance3At limit",
      "Deeintern$0.00$0.00 / $0.0100–Blocks after allowance0Disabled",
    ]);
    expect(
      within(table).getByRole("img", { name: "Eli: $0.0320, 48% of this week's spend" }),
    ).toBeVisible();
    expect(
      within(table).getByRole("img", { name: "Ivy used 110% of today's allowance" }),
    ).toBeVisible();
  });

  test("shows a $0 allowance as pool only", async () => {
    const [first] = usageReport.employees;
    if (!first) throw new Error("fixture has no employees");
    answerWith({
      ...usageReport,
      employees: [
        { ...first, dailyAllowanceMicros: 0, overflow: { kind: "pool", weeklyCapMicros: null } },
      ],
    });
    await renderDashboard();
    expect(within(region("People")).getByText("pool only")).toBeVisible();
  });
});

describe("needs attention", () => {
  test("lists blocked and at-limit people with a short reason and the blocked count", async () => {
    await renderDashboard();
    const attention = region("Needs attention");
    expect(rowTexts(attention, "listitem")).toEqual([
      "IvyDaily allowance used, blocked until 00:00 UTC3 blocked",
      "EliPool cap reached1 blocked",
    ]);
  });

  test("says nobody is blocked when nobody is", async () => {
    answerWith(emptyUsageReport);
    await renderDashboard();
    expect(
      within(region("Needs attention")).getByText("Nobody is blocked this week."),
    ).toBeVisible();
  });
});

describe("spend by project", () => {
  test("ranks projects with untagged spend as (no project), with request and blocked counts", async () => {
    await renderDashboard();
    const projects = region("Spend by project");
    expect(rowTexts(projects, "listitem")).toEqual([
      "checkout$0.04004 requests, 0 blocked",
      "(no project)$0.02603 requests, 4 blocked",
    ]);
  });

  test("explains how to tag requests when there are none", async () => {
    answerWith(emptyUsageReport);
    await renderDashboard();
    expect(
      within(region("Spend by project")).getByText(
        "No tagged requests this week. Send x-project on gateway requests to see spend by project.",
      ),
    ).toBeVisible();
  });
});

describe("a week with no usage yet", () => {
  test("shows zeros, the empty states and where to send a request", async () => {
    answerWith(emptyUsageReport);
    await renderDashboard();
    expect(screen.getByText("Send a request from http/gateway.http to see it here.")).toBeVisible();
    expect(within(region("Weekly pool")).getByText("$0.00")).toBeVisible();
    expect(
      within(region("People")).getByText("Nobody has spent anything this week."),
    ).toBeVisible();
  });
});

describe("loading and errors", () => {
  test("shows a loading placeholder until the first report arrives", async () => {
    renderRoute("/");
    expect(screen.getByRole("status", { name: "Loading usage" })).toBeVisible();
    await screen.findByRole("heading", { level: 1, name: "Acme Corp" });
  });

  test("a rejected admin key says how to set ADMIN_KEY", async () => {
    server.use(
      http.get("*/api/admin/usage", () =>
        HttpResponse.json({ code: "unauthorized" }, { status: 401 }),
      ),
    );
    renderRoute("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The gateway rejected the admin key. Set ADMIN_KEY (8+ characters) in the repo's .env and restart bun dev.",
    );
  });

  test("an unreachable gateway asks whether bun dev is running", async () => {
    // Vite's dev proxy answers 502 when the gateway behind it is down.
    server.use(http.get("*/api/admin/usage", () => new HttpResponse(null, { status: 502 })));
    renderRoute("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Can't reach the gateway. Is bun dev running?",
    );
  });

  test("any other failure shows the status and the request id", async () => {
    server.use(
      http.get("*/api/admin/usage", () =>
        HttpResponse.json({}, { status: 500, headers: { "x-request-id": "req-500" } }),
      ),
    );
    renderRoute("/");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The gateway answered with HTTP 500.");
    expect(alert).toHaveTextContent("Request ID: req-500");
  });

  test("a report in the wrong shape says it can't be read", async () => {
    server.use(http.get("*/api/admin/usage", () => HttpResponse.json({ company: null })));
    renderRoute("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("can't read");
  });
});

describe("live updates", () => {
  const firstFetchAt = new Date("2026-11-18T14:02:10.000Z");

  function startFakeClock() {
    // Only the poll interval, the freshness tick and Date: Testing Library's waits and MSW keep
    // real timeouts, so findBy still resolves.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], now: firstFetchAt });
  }

  test("refetches the report every 2 seconds", async () => {
    startFakeClock();
    await renderDashboard();
    answerWith({
      ...usageReport,
      company: { ...usageReport.company, spentThisWeekMicros: 77_000 },
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await within(region("Weekly pool")).findByText("$0.0770")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/^Live, updated \d+ s ago$/);
  });

  test("a failed poll after a success keeps the data and marks it stale", async () => {
    startFakeClock();
    await renderDashboard();
    server.use(http.get("*/api/admin/usage", () => HttpResponse.error()));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText("Stale since 14:02:10 UTC")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Can't reach the gateway. Is bun dev running?",
    );
    expect(within(region("Weekly pool")).getByText("$0.0660")).toBeVisible();
  });

  test("goes live again once a poll succeeds", async () => {
    startFakeClock();
    await renderDashboard();
    server.use(http.get("*/api/admin/usage", () => HttpResponse.error(), { once: true }));
    await vi.advanceTimersByTimeAsync(2_000);
    await screen.findByText("Stale since 14:02:10 UTC");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText(/^Live, updated \d+ s ago$/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
