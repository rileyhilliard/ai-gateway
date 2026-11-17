# API integration tests

Start with [gateway-http.test.ts](gateway-http.test.ts): the budget requirements as HTTP tests through `app.request()`, grouped by requirement. The other `*-http.test.ts` files do the same for the admin API, admin controls, Anthropic-shaped errors, streaming and percent-of-pool allowances. [http-contract.test.ts](http-contract.test.ts) covers what every route shares: statuses, the error envelope, request ids and the OpenAPI document.

[helpers/app.ts](helpers/app.ts) builds a fresh app with an isolated in-memory store, a fixed clock and captured logs; [helpers/fixtures.ts](helpers/fixtures.ts) builds domain values (companies, tiers, employees, usage records) for the unit tests.

Process-level tests:

- [server.test.ts](server.test.ts) serves the app over a real socket on port 0 and checks shutdown.
- [startup.test.ts](startup.test.ts) runs the real `src/main.ts` and checks its startup failure message.
- [dev-port.test.ts](dev-port.test.ts) covers the port check `bun dev` runs first.
- [seed-file.test.ts](seed-file.test.ts) loads the committed `seed/company.json`.
- [boundaries.test.ts](boundaries.test.ts) probes the Biome plugin's permitted and rejected source patterns.

Vitest runs these and the unit tests beside `../src/` modules. Nothing needs a `.env`, and OpenRouter is stubbed at `fetch`.
