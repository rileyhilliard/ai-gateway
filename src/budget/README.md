# Budget rules

The domain core. Every file here is pure: no I/O, no clock reads, no framework imports. Callers pass in records and `now`, so the rules test with plain values.

Start with [decide.ts](decide.ts), which applies rules 3 to 6 of the spec in order: company pool, daily allowance, then the tier's overflow policy (block, or draw from the pool up to a weekly cap). It returns a `Decision` value; a block is never an exception.

It builds on:

- [types.ts](types.ts): the shared domain types (`Company`, `Tier`, `Employee`, `UsageRecord`, `Decision`). Money is integer micro-dollars (`Micros`) everywhere.
- [periods.ts](periods.ts): UTC days and Monday-to-Monday weeks as half-open windows.
- [spend.ts](spend.ts): the sums the rules compare against limits.
- [limits.ts](limits.ts): a tier's allowance and pool cap with per-employee overrides applied, and percent-of-pool allowances resolved against the current pool.
- [pricing.ts](pricing.ts): the price table (also the model allowlist) and the cost of a token usage.
- [money.ts](money.ts): every conversion between dollars and micro-dollars.

The gateway service and the usage report (`../reports/usage.ts`) both call these, so the report always agrees with the decisions.
