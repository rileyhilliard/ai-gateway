/**
 * Renders the shared app shell around the active child route. The dashboard draws its own
 * header, since the company name comes from the data.
 */

import { Outlet } from "react-router";

/** The page frame every route renders inside. */
export function Layout() {
  return (
    <main className="shell-main">
      <Outlet />
    </main>
  );
}
