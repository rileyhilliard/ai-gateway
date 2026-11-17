# spend-gateway

A gateway that enforces per-employee AI spend budgets in front of OpenRouter. Employees call an Anthropic Messages endpoint with a personal key; the gateway allows, spills to the company's weekly pool, or blocks each request by spend tier, and records its cost. See [problem-statement.md](problem-statement.md) and the [build plan](plans/spend-gateway/README.md).

## Getting started

Needs Node 24 (`.node-version`) and Bun 1.4.

```sh
bun install
cp .env.example .env   # then set OPENROUTER_KEY
bun run dev            # serves on http://localhost:3000
```

Send requests from the `.http` files in `http/` with the VS Code REST Client extension.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Run from source on Node, restarting on change |
| `bun run build` / `bun run start` | Bundle to `dist/main.js` / run the bundle |
| `bun run lint` / `bun run format` | Biome check / apply fixes |
| `bun run typecheck` | tsc over the app, tests and tooling |
| `bun run test` | Vitest once; `bun run test src/config.test.ts` for one file |
| `bun run coverage` | Vitest with coverage |
| `bun run check` | The gate: lint, typecheck, tests, build |

## Configuration

Settings come from `.env` (see `.env.example`): `PORT_API` (default 3000), `LOG_LEVEL` (default `info`), `MAX_BODY_BYTES` (default 65536), and `OPENROUTER_KEY` for real inference.

## API

`POST /v1/messages` takes an Anthropic Messages request with the employee key in `x-api-key`. Errors use one envelope, `{ "error": { "code", "message", "requestId", "issues"? } }`. `/healthz` reports health and `/openapi.json` serves the OpenAPI document.

## Architecture and tests

`src/main.ts` reads the environment, `src/server.ts` runs Node's HTTP server, and `src/app.ts` builds a platform-free fetch handler. `src/config.ts` validates settings with zod, `src/errors.ts` holds the status table and envelope, and `src/logging.ts` the pino logger. Unit tests sit beside each module; `tests/` drives the app through `app.request()` and over a real port. Toolchain at setup: Node 24.21, Bun 1.4.2, TypeScript 7.0, Hono 4.13, zod 4.6, Vitest 5.1, Biome 2.6.
