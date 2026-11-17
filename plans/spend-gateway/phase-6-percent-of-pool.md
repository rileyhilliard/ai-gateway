# Phase 6: percent-of-pool allowances

Status: done, tagged `phase-6`. Built inline (too small for a lane once the seam landed).
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Depends on: phase 3.

- `Tier.dailyAllowance` is `{ kind: "fixed", micros }` or `{ kind: "percentOfPool", basisPoints }` (seam `727bece`), so a tier can't have both. Basis points keep the share an integer; 250 is 2.5%.
- `effectiveLimits(tier, overrides, weeklyPoolMicros)` resolves a share on every decision and in the usage report, so an admin pool change moves it immediately. It rounds down (never above the share) and multiplies in BigInt, since a $1M pool in micros times 10,000 basis points passes Number's exact range.
- An employee's `dailyAllowanceMicros` override still replaces either kind. Overrides stay dollars only.
- The seed takes exactly one of `dailyAllowanceUsd` or `dailyAllowancePercentOfPool` (0 to 100, at most two decimals) per tier. The demo seed adds a Contractor tier at 5% of the pool (blocks after) and Cal (`key-contractor`) on it.
- There is no admin endpoint to edit a tier, so a tier's allowance kind is set in the seed.

Tests: `src/budget/limits.test.ts` and `src/budget/decide.test.ts` (resolution, rounding, the largest pool, overrides), `src/seed/load.test.ts` (percent input and its validation), `tests/percent-of-pool-http.test.ts` (blocks at the share; follows an admin pool change).
