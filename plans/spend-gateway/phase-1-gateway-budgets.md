# Phase 1: the gateway enforces tier budgets (MVP)

Status: done, tagged `phase-1`. Scaffold `6681535`, inline work `91b7b44`.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: `bun run dev`, open `http/gateway.http`, pick the "local" REST Client environment, and send the requests top to bottom. Using `fake/model`, they show one request succeeding from personal allowance, one spilling to the pool, one blocked with a 429 explaining why and when it resets, an unknown key getting 401, and an unknown model getting 400. The last request sends a real `deepseek/deepseek-v4.1-flash-1017` prompt through OpenRouter.

Test cases, by file:

`periods.test.ts`
- Day start for a mid-day time is 00:00 UTC that day; next day start is 00:00 UTC the following day.
- Week start for any day is Monday 00:00 UTC; Sunday 23:59:59.999 belongs to the week before Monday 00:00.
- A time exactly on Monday 00:00 UTC starts the new week and day.
- Results don't depend on the machine's timezone (run with `TZ=America/Chicago` and `TZ=Asia/Tokyo` inside the test).

`pricing.test.ts`
- Cost of 1,000,000 input tokens at 3,000,000 micros/MTok is 3,000,000.
- Input and output use their own prices.
- A fractional micro-dollar rounds up (1 token at 1 micro/MTok costs 1).
- Zero tokens cost 0.
- An unknown model returns `undefined` from `priceFor`.

`limits.test.ts`
- No overrides: allowance and cap come from the tier.
- Allowance override replaces the tier allowance.
- Cap override to a number on an uncapped pool tier caps it; cap override to `null` on a capped tier uncaps it.
- Cap override on a block tier is ignored; overflow stays block.
- The same overrides applied to a different tier give that tier's policy with the overridden numbers (tier move).

`spend.test.ts`
- Company spend this week sums both buckets for the company, from Monday 00:00 UTC.
- Personal spend today counts only that employee's personal-bucket records since 00:00 UTC.
- Pool draws this week count only that employee's pool-bucket records since Monday.
- Blocked records add nothing to any sum.
- Records before the period start are excluded; a record exactly at the start is included.
- Other employees' records don't affect personal spend or pool draws.

`decide.test.ts`
- Under allowance: allow, personal.
- Allowance used, block policy: block `personal_allowance_exhausted`, resetsAt next 00:00 UTC, spent and limit are today's personal spend and allowance.
- Allowance used, pool policy with cap room: allow, pool.
- Allowance used, uncapped pool policy: allow, pool.
- Pool cap reached, allowance above 0: block `pool_cap_reached`, resetsAt next 00:00 UTC.
- Pool cap reached, allowance 0: block `pool_cap_reached`, resetsAt next Monday 00:00 UTC.
- Company spend at the pool: block `company_pool_exhausted` even with allowance left, resetsAt next Monday.
- Company spend reached by personal-only spend blocks everyone (rule 3 sums both buckets).
- Pool lowered below this week's spend: block `company_pool_exhausted`.
- Allowance lowered below today's spend: next decision spills or blocks per policy.
- Allowance 0 with pool policy: first request goes to pool.
- Overshoot: personal spend 0.10 of 0.50 allows personal; a later record of 0.60 then makes the next decision non-personal.
- Monday 00:00 resets both day and week: an employee blocked Sunday 23:59:59 is allowed at Monday 00:00.
- Daily reset only: blocked by allowance at 23:59:59 Tuesday, allowed personal at 00:00 Wednesday, pool draws unchanged.

`memory.test.ts`
- `findEmployeeByKey` returns the employee for a known key and `undefined` otherwise.
- `getTier` returns the tier or `undefined`.
- `listUsageSince` returns only the company's records at or after `since`.
- `addUsage` then `listUsageSince` includes the record.
- Returned objects are copies; mutating them doesn't change the store.

`load.test.ts`
- The repo's `seed/company.json` loads.
- Dollars convert to micros exactly (0.1 becomes 100,000, not 99,999).
- A negative pool, allowance, or cap is rejected with a path in the issue.
- An employee pointing at an unknown tier is rejected.
- Duplicate API keys are rejected.
- Input that isn't an object, or is missing `company`, throws `SeedError` with issues.

`fake.test.ts`
- Default response is an Anthropic message body with `usage` 1000 input and 500 output tokens, status 200.
- `x-fake-input-tokens` and `x-fake-output-tokens` set the usage.
- `x-fake-status: 529` returns that status with an Anthropic error body and `usage: null`.
- `x-fake-status: 500` plus `x-fake-usage: report` returns the error with usage set.
- `x-fake-delay-ms` delays the response (checked with fake timers).
- `x-fake-unreachable: 1` throws `UpstreamUnavailableError`.

`openrouter.test.ts` (fetch is a stub function, never the network)
- Sends `POST https://openrouter.ai/api/v1/messages` with `Authorization: Bearer <key>` and the body unchanged.
- Never forwards `x-api-key`; forwards `anthropic-version` and `anthropic-beta`.
- Maps `usage.input_tokens` and `usage.output_tokens` to `TokenUsage`, and `usage.cost` (USD) to micros rounded up.
- A response without `usage.cost` gives `costMicros: null`.
- A non-2xx response returns its status and body, with usage if the body has any.
- A fetch rejection throws `UpstreamUnavailableError` with the original error as `cause`.
- No key configured throws `UpstreamUnavailableError` without calling fetch.

`select.test.ts`
- `fake/model` selects the fake upstream; `deepseek/deepseek-v4.1-flash-1017` selects OpenRouter.

`service.test.ts` (inline lane)
- Recorded cost uses the upstream's `costMicros` when present, and the price table otherwise.
- Unknown key, disabled employee: `unauthorized`, nothing recorded.
- Unknown model: `unknown_model`, nothing recorded, upstream not called.
- Allowed request records model, tokens, cost, bucket, and the start time from the clock taken before the upstream call.
- Blocked request records status blocked, reason, zero cost, and does not call upstream.
- Upstream error without usage: response passed through, nothing recorded.
- Upstream error with usage: response passed through, allowed record with that cost.
- Upstream unreachable: `upstream_unavailable`, nothing recorded.
- `x-api-key` is not forwarded upstream; `x-fake-*` and `anthropic-*` headers are.
- Two concurrent requests near the limit are both allowed (in-flight overshoot is accepted behavior).

`tests/gateway-http.test.ts` (inline lane)
- 200 passes through the upstream body unchanged.
- 401 envelope for a missing `x-api-key`.
- 400 envelope with issues for a body without `model`.
- 429 envelope includes `budget.reason`, `spentMicros`, `limitMicros`, ISO `resetsAt`, and a readable message.
- 502 envelope when upstream is unreachable.

| Lane | Size | Owns files | Tests | Model |
| --- | --- | --- | --- | --- |
| a | M | `src/budget/periods.ts`, `pricing.ts`, `limits.ts`, `spend.ts`, `decide.ts` | `src/budget/*.test.ts` | opus |
| b | M | `src/store/memory.ts`, `src/seed/load.ts`, `seed/company.json` | `src/store/memory.test.ts`, `src/seed/load.test.ts`, `tests/seed-file.test.ts` | sonnet |
| c | M | `src/upstream/fake.ts`, `openrouter.ts`, `select.ts` | `src/upstream/*.test.ts` | sonnet |
| inline | M | `src/gateway/authenticate.ts`, `src/gateway/service.ts`, `http/gateway.http`, `.vscode/settings.json`, `.env.example` | `tests/gateway-http.test.ts`, `tests/http-contract.test.ts`, `tests/server.test.ts` | me |

The scaffold commit also holds the finished `src/errors.ts` (new codes, `BudgetExceededError`, `UpstreamUnavailableError`), `src/gateway/messages-route.ts`, and the wiring in `app.ts`, `config.ts` and `main.ts`. The service tests listed above run through HTTP in `tests/gateway-http.test.ts` rather than a separate `service.test.ts`, since every behavior they check is visible in the response or the store.

The lane briefs below are the plan-time versions. The dispatched briefs moved the fake upstream from lane b to lane c, so each lane covers one capability, and spelled out the seed values and error classes.

## Lane a brief

- Goal: implement the budget rules as pure functions over plain data, so every rule in the PRD is testable without HTTP or a store.
- Interface:
  - `periods.ts`: `dayStart(at: Date): Date`, `nextDayStart(at: Date): Date`, `weekStart(at: Date): Date`, `nextWeekStart(at: Date): Date`. Weeks start Monday 00:00 UTC.
  - `pricing.ts`: `DEFAULT_PRICES: PriceTable` with `fake/model` at 1,000,000 micros/MTok for input and output, `deepseek/deepseek-v4.1-flash-1017` at 36,000 in and 500,000 out (the model for real-inference tests and demos), and `anthropic/claude-sonnet-5.5` at 2,000,000 in and 10,000,000 out (OpenRouter's list prices on 2026-11-17, noted in a comment), `priceFor(prices: PriceTable, model: string): ModelPrice | undefined`, `costMicros(price: ModelPrice, usage: TokenUsage): Micros`.
  - `limits.ts`: `effectiveLimits(tier: Tier, overrides: Overrides): { dailyAllowanceMicros: Micros; overflow: OverflowPolicy }`.
  - `spend.ts`: `companySpendThisWeek(records, companyId, now)`, `personalSpendToday(records, employeeId, now)`, `poolDrawsThisWeek(records, employeeId, now)`, each returning `Micros`.
  - `decide.ts`: `decide(input: { company: Company; tier: Tier; employee: Employee; usage: UsageRecord[]; now: Date }): Decision`.
- Behavior: the test-case lists for these five files above, plus PRD rules 3 to 6 in that order. Use only UTC methods (`getUTCDay`, `Date.UTC`); never local-time methods.
- Decisions already made: integer micros, cost rounds up, the bucket is chosen at decision time and charged in full, a boundary instant belongs to the new period, rule 3 sums both buckets.
- Out of scope: auth, model lookup, recording, I/O of any kind, concurrency control, percent-of-pool.
- Done when: `bun run test src/budget` and `bun run typecheck` pass.

## Lane b brief

- Goal: give the gateway its data sources: an in-memory store, a seed loader, and a fake Anthropic upstream for tests and the demo.
- Interface:
  - `store/memory.ts`: `createMemoryStore(contents: { company: Company; tiers: Tier[]; employees: Employee[]; usage?: UsageRecord[] }): Store`.
  - `seed/load.ts`: `parseSeed(json: unknown): SeedContents`, where `SeedContents` is the `createMemoryStore` argument. Throws `SeedError` (exported from this file) carrying the zod issues. It does no file I/O: the stack's boundary lint allows Node imports only in `main.ts` and `server.ts`, so `main.ts` reads the file and passes the parsed JSON in.
  - Seed JSON shape: `{ company: { id, name, weeklyPoolUsd }, tiers: [{ id, name, dailyAllowanceUsd, overflow: { kind: "block" } | { kind: "pool", weeklyCapUsd: number | null } }], employees: [{ id, name, tierId, apiKey, disabled?, overrides?: { dailyAllowanceUsd?, poolCapUsd?: number | null } }] }`. Convert dollars with `Math.round(usd * 1_000_000)`.
  - `upstream/fake.ts`: `createFakeUpstream(): Upstream`, always returning `costMicros: null`, and reading `x-fake-input-tokens`, `x-fake-output-tokens`, `x-fake-status`, `x-fake-usage`, `x-fake-delay-ms`, `x-fake-unreachable` from `request.headers` (lowercase keys). Success body: `{ id: "msg_fake_<n>", type: "message", role: "assistant", model, content: [{ type: "text", text: "Fake reply." }], stop_reason: "end_turn", usage: { input_tokens, output_tokens } }`. Error body: `{ type: "error", error: { type: "api_error", message: "Fake upstream error." } }`.
  - `seed/company.json`: company "Acme" with a $1.00 weekly pool; tiers `intern` ($0.01/day, block), `engineer` ($0.01/day, pool capped at $0.02/week), `staff` ($0.05/day, uncapped pool); one employee per tier with keys `key-intern`, `key-engineer`, `key-staff`, plus a disabled employee `key-disabled`.
- Behavior: the test-case lists for `memory.test.ts`, `load.test.ts`, `fake.test.ts` above.
- Decisions already made: v1 is one company; keys are plain text; the store is async so a database can replace it.
- Out of scope: store mutation methods (phase 3), key hashing, the real Anthropic adapter.
- Done when: `bun run test src/store src/seed src/upstream` and `bun run typecheck` pass.

## Lane c brief

- Goal: real inference through OpenRouter, and the per-request choice between it and the fake upstream.
- Interface:
  - `upstream/openrouter.ts`: `createOpenRouterUpstream(options: { apiKey: string | undefined; fetch: typeof fetch; baseUrl?: string }): Upstream`. `baseUrl` defaults to `https://openrouter.ai/api`; requests go to `${baseUrl}/v1/messages`.
  - `upstream/select.ts`: `selectUpstream(model: string, upstreams: { fake: Upstream; openrouter: Upstream }): Upstream`. A `fake/` prefix picks `fake`.
- Behavior: the `openrouter.test.ts` and `select.test.ts` cases above. Forward only `content-type`, `anthropic-version` and `anthropic-beta` from the incoming headers, and add the Bearer header. Convert `usage.cost` with `Math.ceil(cost * 1_000_000)`. Read the body as JSON; if it isn't JSON, return it as text with the status and `usage: null`.
- Decisions already made: Anthropic Messages wire format, non-streaming only, OpenRouter's reported cost wins over the price table, a missing key fails per request rather than at startup.
- Out of scope: streaming, retries, OpenRouter's provider routing options, reading `process.env` (the key arrives through options).
- Done when: `bun run test src/upstream/openrouter src/upstream/select` and `bun run typecheck` pass.
