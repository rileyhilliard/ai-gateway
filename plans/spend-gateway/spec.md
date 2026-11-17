# Spec and contracts: Spend Gateway

## Spec

A gateway that speaks the Anthropic Messages API and forwards to OpenRouter. Per request, it decides whether an employee's spend comes from their daily allowance or the company's weekly pool, or is blocked, and records the cost. v1 serves one company seeded from a JSON file. Model ids starting with `fake/` go to an in-process fake upstream instead, so tests and the budget demo are deterministic and free.

In scope: everything under "Must have" in the PRD, split across phases 1 to 3, plus real inference through OpenRouter in phase 1 and `.http` request files for every phase's endpoints.

Out of scope: the PRD's "Won't have" list, plus phases 4 onward unless time allows.

Assumptions (defaults taken without asking; override any of them):

- Seed and admin inputs are in dollars (`dailyAllowanceUsd: 0.5`). Everything inside the app is integer micro-dollars.
- Recorded cost is OpenRouter's reported `usage.cost` (USD) converted to micros and rounded up, when the response has it. Otherwise it's `ceil((inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000)` micro-dollars from our price table, with prices in micro-dollars per million tokens. Rounding up means we never undercharge. The fake upstream never reports a cost, so tests use the price table.
- The price table also serves as the model allowlist for rule 2. Model ids are OpenRouter's (`deepseek/deepseek-v4.1-flash-1017`), and the scaffold copies current prices from `https://openrouter.ai/api/v1/models`.
- The upstream is chosen per request by model id: a `fake/` prefix goes to the fake upstream, everything else to OpenRouter. With no `OPENROUTER_KEY` set, OpenRouter requests return 502 `upstream_unavailable`; the app still starts.
- The gateway replaces the employee's `x-api-key` with `Authorization: Bearer <OPENROUTER_KEY>`. The OpenRouter key never appears in `.http` files or responses.
- Keys are stored in plain text in the seed for v1. Hashing comes with real persistence.
- Only allowed requests and 429 budget blocks are recorded. 401s and 400s are not recorded, and the blocked-request count means 429s.
- An upstream error without usage writes no record. An upstream error with usage writes an allowed record with that cost.
- The upstream being unreachable (network error) returns 502 `upstream_unavailable` and charges nothing.
- Gateway errors use the stack's error envelope, not Anthropic's error shape. The `message` is a readable sentence ("Daily allowance of $0.50 used. Resets 2026-11-18T00:00:00.000Z."), so a client that prints only the message still shows the reason. Switching to Anthropic's shape is part of phase 4.
- The admin API authenticates with one `ADMIN_KEY` env var sent as `x-admin-key`.
- The stack's sample notes resource is deleted in the scaffold.

## Error model

| Failure | Status | Code | Body extras | Recorded |
| --- | --- | --- | --- | --- |
| Missing, unknown, revoked key, or disabled employee | 401 | `unauthorized` | none | no |
| Body isn't JSON, or `model` missing or not a string | 400 | `bad_request` | `issues` | no |
| `model` not in the price table | 400 | `unknown_model` | none | no |
| Budget rule 3 or 6 | 429 | `budget_exceeded` | `budget: { reason, spentMicros, limitMicros, resetsAt }` | yes, as blocked |
| Upstream returns an error status | upstream's status | upstream body passed through; `retry-after` too on 429 and 529 | none | only if usage reported |
| Upstream unreachable, OpenRouter key not configured, OpenRouter rejects the company key (401) or the account is out of credits (402) | 502 | `upstream_unavailable` | none; the warn log's cause says what to fix | no |
| Seed file missing or invalid at startup | process exits 1 | n/a | zod issues with paths, logged | n/a |
| Anything else | 500 | `internal` | none | no |

Domain functions in `src/budget/` never throw for budget outcomes; they return a `Decision`. They throw only on programmer error, such as a tier id that doesn't exist, which surfaces as 500.

## Contracts (scaffold commit)

`src/budget/types.ts` holds every shared type:

```ts
export type Micros = number; // integer micro-dollars; $1 = 1_000_000
export type Clock = () => Date;

export type Company = { id: string; name: string; weeklyPoolMicros: Micros };

export type OverflowPolicy =
  | { kind: "block" }
  | { kind: "pool"; weeklyCapMicros: Micros | null }; // null = no personal cap

export type Tier = { id: string; name: string; dailyAllowanceMicros: Micros; overflow: OverflowPolicy };

// undefined = use the tier's value; poolCapMicros null = uncapped
export type Overrides = { dailyAllowanceMicros?: Micros; poolCapMicros?: Micros | null };

export type Employee = {
  id: string; companyId: string; name: string; tierId: string;
  overrides: Overrides; apiKey: string; disabled: boolean;
};

export type Bucket = "personal" | "pool";
export type BlockReason = "company_pool_exhausted" | "personal_allowance_exhausted" | "pool_cap_reached";

export type UsageRecord = {
  id: string; companyId: string; employeeId: string; model: string;
  status: "allowed" | "blocked"; bucket: Bucket | null; blockReason: BlockReason | null;
  inputTokens: number; outputTokens: number; costMicros: Micros;
  startedAt: Date; projectTag: string | null;
};

export type Decision =
  | { kind: "allow"; bucket: Bucket }
  | { kind: "block"; reason: BlockReason; spentMicros: Micros; limitMicros: Micros; resetsAt: Date };

export type ModelPrice = { inputMicrosPerMTok: Micros; outputMicrosPerMTok: Micros };
export type PriceTable = Record<string, ModelPrice>;
export type TokenUsage = { inputTokens: number; outputTokens: number };
```

`src/upstream/types.ts`:

```ts
export type UpstreamRequest = { body: unknown; headers: Record<string, string> };
// costMicros: the provider's own reported cost, when it sends one (OpenRouter's usage.cost)
export type UpstreamResponse = { status: number; body: unknown; usage: TokenUsage | null; costMicros: Micros | null };
/** @throws {UpstreamUnavailableError} (from src/errors.ts) when the provider can't be reached. */
export interface Upstream { send(request: UpstreamRequest): Promise<UpstreamResponse> }
```

`src/store/types.ts`:

```ts
export interface Store {
  getCompany(): Promise<Company>;
  getTier(id: string): Promise<Tier | undefined>;
  findEmployeeByKey(apiKey: string): Promise<Employee | undefined>;
  listUsageSince(companyId: string, since: Date): Promise<UsageRecord[]>;
  addUsage(record: UsageRecord): Promise<void>;
}
```

Layout. Files marked (stack) come from `hono-api`; the rest are new stubs.

    src/
      main.ts                   reads env, loads the seed, starts the server; wiring only (stack)
      server.ts                 Node HTTP server (stack)
      app.ts                    mounts middleware and routes, takes AppDeps; wiring only (stack, edited)
      config.ts                 validates env: PORT_API, SEED_PATH, ADMIN_KEY, OPENROUTER_KEY (optional) (stack, edited)
      errors.ts                 status table plus unauthorized, unknown_model, budget_exceeded, upstream_unavailable (stack, edited)
      logging.ts, router.ts     (stack)
      budget/types.ts           shared domain types above
      budget/periods.ts         UTC day and week boundaries; pure
      budget/pricing.ts         default price table and cost of a token usage; pure
      budget/limits.ts          resolves an employee's effective allowance and pool cap from tier plus overrides; pure
      budget/spend.ts           the three spend sums over usage records; pure
      budget/decide.ts          rules 3 to 6: allow with a bucket, or block with reason and resetsAt; pure
      store/types.ts            Store interface
      store/memory.ts           in-memory Store; the only module holding state
      seed/load.ts              validates parsed seed JSON into store contents, dollars to micros; no file I/O
      upstream/types.ts         Upstream interface (UpstreamUnavailableError lives in errors.ts, since it renders as the 502 envelope)
      upstream/fake.ts          fake Anthropic upstream driven by x-fake-* headers
      upstream/openrouter.ts    forwards to OpenRouter's /api/v1/messages with the company key; takes fetch as a dependency
      upstream/select.ts        picks fake or OpenRouter by model id prefix
      gateway/authenticate.ts   rule 1: gateway key to active employee; runs as route middleware before body validation
      gateway/service.ts        one authenticated request: model price, decide, forward, record
      gateway/messages-route.ts POST /v1/messages; maps service results to HTTP
    seed/company.json           demo company Acme ($1 weekly pool); tiers intern ($0.01/day, block), engineer ($0.01/day, pool cap $0.02/week), staff ($0.05/day, uncapped); keys key-intern, key-engineer, key-staff, key-disabled
    http/gateway.http           REST Client requests: allow, spill, block, 401, 400, real inference
    .env.example                PORT_API, SEED_PATH, ADMIN_KEY, OPENROUTER_KEY placeholders

Tests sit next to each module (`src/budget/decide.test.ts`), plus `tests/gateway-http.test.ts` through `app.request()`.

## `.http` files

Each phase that adds an endpoint adds its requests to `http/`, and a phase isn't done until every request in it returns what its comment says. Each file declares its variables at the top (`@baseUrl`, `@internKey`, `@engineerKey`, `@staffKey`, `@disabledKey`, `@adminKey`), so requests work without choosing a REST Client environment. The seeded employee keys and the dev admin key are demo values, so they're committed. The OpenRouter key stays server-side in `.env` and never appears in these files. Requests are separated by `###`, each with a `# @name` and a one-line comment saying the expected status and why.
