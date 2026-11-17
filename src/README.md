# API source

The gateway: a Hono app that takes Anthropic Messages requests from employees, decides each one against their budget, forwards it to OpenRouter (or the in-process fake) and records its cost, plus the admin API that reports and changes budgets.

Start with [app.ts](app.ts). It builds the whole API as a platform-free fetch handler: middleware, every router, the OpenAPI document and error rendering. [main.ts](main.ts) is the process entry: it validates the environment ([config.ts](config.ts)), loads the seed file, wires the store, upstreams and clock into the app, and handles signals. [server.ts](server.ts) adapts the app to Node's HTTP server. Only those two files may touch `process` or `node:*`; Biome's boundary plugin enforces it.

A gateway request flows `gateway/messages-route.ts` (key check, body validation) → `gateway/service.ts` (price, budget decision, forward, record) → `budget/` (pure rules) and `store/` → `upstream/`.

| Folder | Owns |
| --- | --- |
| [budget/](budget/README.md) | Pure budget rules: periods, money, pricing, limits, spend sums and the allow/spill/block decision |
| [gateway/](gateway/README.md) | `POST /v1/messages`: authentication, the request service, stream usage, Anthropic-shaped errors |
| [upstream/](upstream/README.md) | The provider contract, OpenRouter, the fake, and choosing between them |
| [admin/](admin/README.md) | The admin API behind `x-admin-key`: usage report, budget changes, demo clock |
| `store/` | The `Store` interface (`types.ts`) and the in-memory implementation, the only module holding state |
| `seed/` | Validates the seed JSON and converts dollars to micro-dollars; `main.ts` reads the file |
| `reports/` | The usage report, built from the same sums and limits the decisions use |
| `clock/` | The demo clock an admin can move forward when `DEMO_CLOCK=1` |
| `routes/` | The health probe |

Shared across them: [router.ts](router.ts) creates every router with the validation hook that turns bad input into the error envelope, [errors.ts](errors.ts) holds the error codes, statuses and envelope, and [logging.ts](logging.ts) the pino logger and request records.

Unit tests sit beside each module; `../tests/` drives the app over HTTP.
