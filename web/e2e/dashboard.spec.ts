/**
 * Browser tests of the built dashboard served by vite preview, with the gateway routed in the
 * browser: the page renders a report, keeps polling, and shows a failure's request id.
 */

import { expect, type Page, test } from "@playwright/test";
import { loadEnv } from "vite";
import { usageReport } from "../tests/fixtures/usage";

// The API base the build baked in, read the way `vite build` reads it, so the routes below catch
// the requests whatever VITE_API_URL is.
const configured = loadEnv("production", process.cwd(), "VITE_").VITE_API_URL || "/api";
const apiBase = configured.replace(/\/+$/, "");
const usageUrl = apiBase.startsWith("/") ? `**${apiBase}/admin/usage` : `${apiBase}/admin/usage`;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("renders the usage report and picks up new spend on the next poll", async ({ page }) => {
  const errors = collectErrors(page);
  let spent = usageReport.company.spentThisWeekMicros;
  await page.route(usageUrl, (route) =>
    route.fulfill({
      json: { ...usageReport, company: { ...usageReport.company, spentThisWeekMicros: spent } },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Acme Corp" })).toBeVisible();
  const pool = page.getByRole("region", { name: "Weekly pool" });
  await expect(pool.getByText("$0.0660")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("At limit");
  spent = 77_000;
  await expect(pool.getByText("$0.0770")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unknown address renders the not-found page", async ({ page }) => {
  await page.route(usageUrl, (route) => route.fulfill({ json: usageReport }));
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Acme Corp" })).toBeVisible();
});

test("a gateway failure shows the status and request id", async ({ page }) => {
  await page.route(usageUrl, (route) =>
    route.fulfill({ status: 500, headers: { "x-request-id": "req-e2e" }, json: {} }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("The gateway answered with HTTP 500.");
  await expect(page.getByRole("alert")).toContainText("Request ID: req-e2e");
});
