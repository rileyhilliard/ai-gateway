# spend-dashboard

The executive spend dashboard for the spend gateway in the repo root. A React single-page app built with Vite: it polls the gateway's `GET /admin/usage` every 2 seconds and shows whether the weekly pool is on track, who drives the spend, who is at their limit, and spend by project.

## Getting started

Needs Node 24 and Bun 1.4. From the repo root, put `ADMIN_KEY` (8+ characters) in `.env` and run `bun run dev`: it starts the gateway and this app together and opens the dashboard. Ctrl-C stops both.

In development, Vite proxies `/api/*` to the gateway at `http://localhost:${PORT_API:-3000}` and adds `x-admin-key` from the root `.env`'s `ADMIN_KEY` (`vite.config.ts`, read with `loadEnv`). The key stays in the dev server, never in the bundle.

## Commands

Run these in `web/`.

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server with the gateway proxy |
| `bun run build` | Build the static site into `dist/` |
| `bun run preview` | Serve `dist/` locally |
| `bun run lint` / `bun run format` | Biome check / apply fixes |
| `bun run typecheck` | tsc over the app, tests and configs |
| `bun run test` | Vitest once; `bun run test src/features/dashboard/pace.test.ts` for one file |
| `bun run coverage` | Vitest with coverage |
| `bun run e2e` | Build, then Playwright against `vite preview` |
| `bun run check` | Lint, typecheck, tests and e2e |

## Configuration

| Variable | Default | Read by |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | the app (baked into the bundle) |
| `VITE_LOG_LEVEL` | `info` | the app (baked into the bundle) |
| `ADMIN_KEY` | none | the dev proxy only, from the root `.env` |
| `PORT_API` | `3000` | the dev proxy's target port |
| `PORT_E2E` | `4180` | Playwright's preview server |

Every `VITE_*` value ships to the browser, so never put a secret in one.

## Deploying

Not deployed yet. The admin key is added by the dev proxy, so a deploy needs a backend that adds it the same way.

## Architecture and tests

`src/api/` is the only code that calls `fetch`; it validates the usage report with zod. `src/features/dashboard/` is the page, with its rules in pure modules (`pace.ts`, `people.ts`, `money.ts`, `time.ts`). Component tests render the real route against MSW; Playwright tests the built bundle with the gateway routed in the browser. Toolchain: Vite 8.3, React 19.3, React Router 8.5, TanStack Query 5.108, TypeScript 7.0.
