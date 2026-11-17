# Phase 3: admins change budgets and keys, with a demo clock

Status: done on `build/spend-gateway-p3` (worktree `.claude/worktrees/phase-3`), branched from phase 2 because it extends the admin key check and routes. Gate green (212 tests); waiting to merge with phase 2.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: with `ADMIN_KEY` set and `DEMO_CLOCK=1`, send the phase 3 section of `http/admin.http`. Lower the pool and watch the next request get 429, move Ivy to another tier and watch her next request spill instead, revoke and reissue Eli's key, and advance the clock 24 hours to see an allowance refill.
Depends on: phase 2 (admin key, admin routes, usage view).

## Decisions

Defaults taken without a grill round; override any of them.

- Inputs in dollars (`weeklyPoolUsd`, `dailyAllowanceUsd`, `poolCapUsd`), converted with `Math.round(usd * 1_000_000)`; responses in micro-dollars like the usage view. Negative values are 400, zero is valid.
- `PUT /admin/employees/{id}/overrides` replaces the whole override set: an absent field means no override, `poolCapUsd: null` means uncapped, `{}` clears everything. This avoids `null` meaning both "uncapped" and "remove the override".
- Revoke is `DELETE /admin/employees/{id}/key` and sets `disabled: true`; reissue is `POST` on the same path, returns `{ employeeId, apiKey }` once, and re-enables the employee. No other response includes a key.
- New keys are `key-<id>` from the gateway's id generator (random UUIDs in production), so tests get predictable keys.
- Unknown employee is 404 `not_found`; unknown tier is 400 `bad_request` with an issue at `json.tierId`.
- The demo clock adds an offset to the real clock and only moves forward, so new requests are never dated before recorded ones. `POST /admin/clock/advance { hours }` takes 0 < hours <= 336 and exists only when `DEMO_CLOCK=1`.
- One `updateEmployee(id, changes)` store method instead of one per field; `undefined` values in `changes` are skipped.
- Dollar inputs are capped at $1,000,000 (`MAX_USD` in `src/budget/money.ts`, shared with the seed loader) so micro-dollar sums stay exact.

## Contracts

| Module | Responsibility | State |
| --- | --- | --- |
| `src/store/types.ts`, `memory.ts` | `setWeeklyPool`, `getEmployee`, `updateEmployee` | done in the scaffold |
| `src/clock/demo-clock.ts` | `createDemoClock(base)`: `now`, `advance(ms)` | done in the scaffold |
| `src/config.ts`, `src/app.ts`, `src/main.ts` | `DEMO_CLOCK`, mounting, wiring the demo clock as the gateway clock | done in the scaffold |
| `src/admin/budget-routes.ts` | pool, tier, overrides, revoke, reissue | lane a |
| `src/admin/clock-route.ts` | `POST /admin/clock/advance` | lane a |

Response shapes: pool `{ id, name, weeklyPoolMicros }`; employee `{ id, name, tierId, disabled, overrides: { dailyAllowanceMicros?, poolCapMicros? } }`; reissue `{ employeeId, apiKey }`; clock `{ now }` as ISO.

## Tests

`tests/admin-controls-http.test.ts` (every behavior above, each followed by a gateway request showing the change), `src/store/memory.test.ts` (mutators), `src/clock/demo-clock.test.ts`, `src/config.test.ts` (`DEMO_CLOCK`), and the OpenAPI path list.

## Lanes

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| a | M | `src/admin/budget-routes.ts`, `src/admin/clock-route.ts` | opus (auth and money inputs) |

The store and clock changes were small enough to write inline, which left one lane.

## Log

- Lane a (opus) landed clean. Accepted choices: middleware written inline per route (a shared readonly array fails typecheck); OpenAPI component names and operation ids; overrides, revoke and reissue get their 404 from `updateEmployee` instead of a separate lookup.
- Review (no auth or leak bugs): dollar inputs capped at $1,000,000; one `usdToMicros` for seed and admin; `updateEmployee` skips undefined fields; `createApp` throws if the demo clock isn't the gateway's clock; the 401 tests now prove nothing changed by comparing the usage view; tests for a numeric pool cap and its response; the UUID uniqueness assumption is documented where keys are made.
