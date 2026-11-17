/**
 * Exercises the app's route tree: an unknown address gets the not-found page, and a page that
 * throws while rendering gets the error page with the failure logged. The dashboard's own
 * states are tested beside it in features/dashboard.
 */

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute } from "../../tests/render";
import { createLogger } from "../logging";
import { routes } from "./routes";

function Broken(): never {
  throw new TypeError("render failed");
}

test("an unknown address renders the not-found page, which links back to the dashboard", async () => {
  renderRoute("/no/such/page");
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeVisible();
  await userEvent.click(screen.getByRole("link", { name: "Back to the dashboard" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Acme Corp" })).toBeVisible();
});

test("a page that throws while rendering gets the error page, and the error is logged", async () => {
  const [root] = routes;
  if (!root || root.index) throw new Error("expected the layout route first");
  const logger = createLogger("silent");
  const logged = vi.spyOn(logger, "error");
  // React reports the caught render error on the console; keep test output to failures.
  vi.spyOn(console, "error").mockImplementation(() => {});
  renderRoute("/", {
    logger,
    routes: [{ ...root, children: [{ index: true, Component: Broken }] }],
  });
  expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeVisible();
  expect(logged).toHaveBeenCalledWith("route_error", { name: "TypeError" });
});
