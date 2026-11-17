# Phase 3: admins change budgets and keys, with a demo clock

Status: planned.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: from new requests appended to `http/admin.http`, lower the pool or move an employee between tiers through the admin API and watch the next request change outcome; reissue a key and see the old one get 401; advance the demo clock past midnight UTC and see an allowance refill.
Depends on: phase 1. Runs alongside phase 2; both phases' stubs (admin auth, routes in `app.ts`) go into one scaffold commit first.

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| a | S | `src/store/memory.ts` mutators (`setPool`, `setEmployeeTier`, `setOverrides`, `reissueKey`, `setDisabled`), with a `Store` interface extension in the scaffold | sonnet |
| b | M | `src/admin/budget-routes.ts` (validation rejects negatives with 400, accepts zero), `src/clock/demo-clock.ts` (`POST /admin/clock/advance`, enabled only when `DEMO_CLOCK=1`), the phase 3 section of `http/admin.http` | sonnet |
