# Phase 2: admins see spend per employee

Status: scaffolded on `build/spend-gateway-p2` (worktree `.claude/worktrees/phase-2`); one lane running.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: set `ADMIN_KEY=dev-admin-key` in `.env`, run the phase 1 requests, then send `http/admin.http` and open `localhost:3000/admin`. Each employee shows spend today against allowance, pool draws against cap and blocked count; the company shows spend against the pool. The numbers match what the gateway allowed, spilled and blocked.
Depends on: phase 1.

## Decisions

Defaults taken without a grill round; override any of them.

- Money in the JSON is integer micro-dollars, like the 429 body. Only the HTML page formats dollars.
- "Blocked requests" counts this week's (since Monday 00:00 UTC), matching the pool period.
- `ADMIN_KEY` is optional. Unset, every admin request gets 401 and startup logs a warning, so phase 1 keeps running without it.
- `GET /admin` is an unauthenticated static page. It asks for the admin key, keeps it in `sessionStorage`, and fetches `/admin/usage` with `x-admin-key`. Browsers can't send a custom header on a plain navigation, and the page holds no data itself.
- Rows reuse `effectiveLimits` and the `spend.ts` sums, so the view can't disagree with the decision rules.
- Plain `===` key comparison, the same as employee keys in phase 1. Constant-time comparison is deferred with key hashing.

## Contracts (in the scaffold)

| Module | Responsibility |
| --- | --- |
| `src/store/types.ts` | adds `listTiers()` and `listEmployees()`, both in seed order |
| `src/reports/usage.ts` | `usageReport({ company, tiers, employees, usage, now }): UsageReport`, pure |
| `src/admin/auth.ts` | `requireAdmin(adminKey)` middleware, throws `UnauthorizedError` |
| `src/admin/usage-route.ts` | `adminRoutes({ store, clock, adminKey })`: `GET /admin/usage` and `GET /admin` |
| `src/config.ts`, `src/app.ts`, `src/main.ts` | `ADMIN_KEY` config, route mounting, the startup warning (done in the scaffold) |

Wire shape of `GET /admin/usage`: `{ asOf, dayResetsAt, weekResetsAt, company: { id, name, spentThisWeekMicros, weeklyPoolMicros }, employees: [{ employeeId, name, tierId, disabled, spentTodayMicros, dailyAllowanceMicros, overflow, poolDrawsThisWeekMicros, blockedThisWeek }] }`, with dates as ISO strings and `overflow` as `{ kind: "block" }` or `{ kind: "pool", weeklyCapMicros: number | null }`.

## Tests

`src/store/memory.test.ts` (lists), `src/reports/usage.test.ts` (periods, overrides, blocked counts, missing tier), `tests/admin-http.test.ts` (401 cases including an unset `ADMIN_KEY`, the report after real gateway traffic, the page holds no data), and the OpenAPI path list in `tests/http-contract.test.ts`.

## Lanes

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| a | M | `src/store/memory.ts`, `src/reports/usage.ts`, `src/admin/auth.ts`, `src/admin/usage-route.ts` | opus |

One lane: the report, auth and route are one capability with a contract seam only at the store, which is two trivial methods.
