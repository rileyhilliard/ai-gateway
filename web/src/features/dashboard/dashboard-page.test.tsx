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
  test("names the company and when the week resets", async () => {
    await renderDashboard();
    expect(screen.getByText("Week resets Mon 00:00 UTC (in 4d 9h)")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/^Live, updated \d+ s ago$/);
  });
});

describe("pool panel: are we on track for this week's pool?", () => {
  test("shows spent against the pool, the percent used and the on-pace projection", async () => {
    await renderDashboard();
    const pool = region("Weekly pool");
    expect(within(pool).getByText("$0.0660")).toBeVisible();
    expect(within(pool).getByText("of $1.00")).toBeVisible();
    expect(within(pool).getByText("7% used")).toBeVisible();
    expect(
      within(pool).getByRole("img", {
        name: "Pool used: $0.0660 of $1.00 (7%). 37% of the week has gone.",
      }),
    ).toBeVisible();
    expect(
      within(pool).getByText("On pace: projected $0.1787 by Monday (18% of pool)"),
    ).toBeVisible();
  });

  test("warns when spend is running ahead of the week", async () => {
    answerWith({
      ...usageReport,
      company: { ...usageReport.company, spentThisWeekMicros: 500_000 },
    });
    await renderDashboard();
    expect(
      within(region("Weekly pool")).getByText("Over pace: projected $1.35, 135% of the pool"),
    ).toBeVisible();
  });

  test("says so when the pool is already spent", async () => {
    answerWith({
      ...usageReport,
      company: { ...usageReport.company, spentThisWeekMicros: 1_000_000 },
    });
    await renderDashboard();
    expect(
      within(region("Weekly pool")).getByText(
        "Pool spent: requests past people's allowances are blocked until Mon 00:00 UTC.",
      ),
    ).toBeVisible();
  });
});

describe("KPI strip", () => {
  test("shows spend, pool left, active people and blocked requests", async () => {
    await renderDashboard();
    const kpis = region("This week at a glance");
    expect(within(kpis).getByText("Spent this week").nextSibling).toHaveTextContent("$0.0660");
    expect(within(kpis).getByText("Pool remaining").nextSibling).toHaveTextContent("$0.9340");
    expect(within(kpis).getByText("Active people").nextSibling).toHaveTextContent("3 of 4");
    expect(within(kpis).getByText("Blocked requests").nextSibling).toHaveTextContent("4");
  });
});

describe("who's using the budget", () => {
  test("ranks people by cost this week with their share of spend", async () => {
    await renderDashboard();
    const ranking = region("Who's using the budget");
    expect(rowTexts(ranking, "listitem")).toEqual([
      "Eli$0.032048%",
      "Sam$0.023035%",
      "Ivy$0.011017%",
    ]);
    expect(
      within(ranking).getByRole("img", { name: "Eli: $0.0320, 48% of this week's spend" }),
    ).toBeVisible();
  });
});

describe("people table", () => {
  test("lists everyone by cost with allowance used today, pool draws and status", async () => {
    await renderDashboard();
    const table = within(region("People")).getByRole("table");
    expect(rowTexts(table, "row")).toEqual([
      "NameTierCost this weekAllowance used todayPool draws this weekBlocked this weekStatus",
      "Eliengineer$0.0320$0.0100 / $0.0100$0.0220 / $0.02001At limit",
      "Samstaff$0.0230$0.0230 / $0.0500$0.00 / uncapped0",
      "Ivyintern$0.0110$0.0110 / $0.0100blocks after allowance3At limit",
      "Deeintern$0.00$0.00 / $0.0100blocks after allowance0Disabled",
    ]);
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
  test("lists blocked and at-limit people with the plain reason", async () => {
    await renderDashboard();
    const attention = region("Needs attention");
    expect(rowTexts(attention, "listitem")).toEqual([
      "IvyBlocked 3 times this week; their daily allowance is $0.0100.At their limit now: today's allowance is used, so requests are blocked until 00:00 UTC.",
      "EliBlocked once this week; their daily allowance is $0.0100 and their weekly pool cap is $0.0200.At their limit now: today's allowance and this week's pool cap are both used.",
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
      within(region("Who's using the budget")).getByText("Nobody has spent anything this week."),
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
