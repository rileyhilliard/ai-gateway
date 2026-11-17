# spend-dashboard

Instructions for coding agents working in this repository. Keep this file under about 200 lines: it is loaded at the start of every session. Put detail that matters only for one area in a doc and link it from Deeper context.

## Overview

The executive spend dashboard for the spend gateway in the repo root. It polls the gateway's `GET /admin/usage` and shows the weekly pool's pace, who drives spend, who is at their limit, and spend by project. React SPA on Vite with React Router, TanStack Query and zod; Vitest, Testing Library and MSW for tests, Playwright for the browser. Plan: [plans/dashboard/plan.md](../plans/dashboard/plan.md).

## Commands

Run these from `web/`. At the repo root, `bun run dev` starts the gateway and this dev server together and opens the browser. They are the only supported way to build, test, and run the project; if a command here is wrong, fix it here in the same change.

| Command | What it does |
| --- | --- |
| `bun run dev` | Run the Vite development server, proxying `/api/*` to the gateway |
| `bun run build` | Build the static site into dist/ |
| `bun run preview` | Serve dist/ locally, with index.html for unknown paths |
| `bun run typecheck` | Run tsc over the app, tests and configs |
| `bun run lint` | Run Biome checks, including the boundary plugin |
| `bun run format` | Apply Biome formatting and safe fixes |
| `bun run test` | Run Vitest once |
| `bun run test:watch` | Watch Vitest tests |
| `bun run coverage` | Run Vitest with coverage |
| `bun run e2e` | Build, then run the Playwright tests against vite preview |
| `bun run check` | Run lint, typecheck, tests and e2e |
| `bun run clean` | Remove build, test and coverage output |
| `bun install` | Install dependencies |
| `bun run test src/features/dashboard/pace.test.ts` | Run one test file; add `-t "<name>"` for one test |

## Architecture map

```
src/
  api/                 the only fetch: client, typed errors, query client, usage.ts (schema + polling query)
  app/                 routes, layout, route error page, services context
  features/dashboard/  the page, its panels, and pure rules (pace, people, money, time)
  components/          ErrorState
tests/                 MSW server, usage fixtures (shared with Playwright), render helper, Grit probes
e2e/                   Playwright against the built bundle
```

Data flows: `DashboardPage` reads `usageQuery` every 2 s, the API client decodes the report with zod, and each panel renders the decoded report. In dev, Vite proxies `/api/*` to the gateway and adds `x-admin-key` (`vite.config.ts`).

## Agent harness

Claude Code only. Hooks live in `.claude/hooks/` and are wired in `.claude/settings.json`; [.claude/README.md](.claude/README.md) lists them. Skills live in `.claude/skills/`.

| Rule | Covers |
| --- | --- |
| `.claude/rules/engineering.md` | everything |
| `.claude/rules/react-vite/app.md` | the app |
| `.claude/rules/react-vite/testing.md` | tests |
| `.claude/rules/react-vite/verification.md` | finishing work |

## Conventions

- Only `src/api/` calls `fetch`, only `src/config.ts` reads `import.meta.env`, and only `src/logging.ts` touches `console`; the Grit plugin fails lint otherwise. Details in [app guidance](docs/guidance/react-vite/app.md).
- The admin key never goes in a `VITE_` variable. The dev proxy reads `ADMIN_KEY` from the root `.env` with `loadEnv` and adds the header server-side.
- Money arrives as integer micro-dollars and becomes text only in `features/dashboard/money.ts`. Clock times are UTC, like the gateway's budget periods.
- Rules the page derives (pace, at-limit, ranking) are pure functions with their own tests; components only format.

- Prefer the project's existing patterns and dependencies over new ones. Add a dependency only when nothing in the project already covers the need.
- Keep changes scoped to the task. Mention unrelated problems you notice instead of fixing them in the same change.
- Organize folders by feature or domain. Give each module one responsibility; keep domain rules independent of I/O and use public interfaces across boundaries.
- Name files for their contents. Keep functions small, with names that read as the steps of the operation; avoid catch-all utils and speculative abstractions.
- Put a file-level doc comment at the top of every source file explaining its role in the system, using the language's convention (JSDoc for TS/JS, a module docstring for Python, a package comment for Go, `//!` for Rust). Keep required directives in place; generated source stays generator-owned.
- Add a README.md to each folder that is a meaningful architectural unit: purpose, place in the system and where to start reading. Judge whether trivial folders, fixtures or generated output need one; don't add empty ceremony.
- Keep comments about constraints and reasons. Let names and types explain ordinary mechanics, and update documentation when responsibilities change.

Read [code style](docs/guidance/engineering/code-style.md) and [architecture](docs/guidance/engineering/architecture.md) before writing code.

## Guardrails

- Destructive commands, credential-shaped writes and real `.env` writes are guarded by native hooks when this project targets Claude Code, Codex, OpenCode or Cursor. A block means ask the user; never rephrase a command or use another tool to bypass it.
- Store credentials in environment variables or a secrets manager. Write variable names and placeholders in `.env.example`; ask the user to set real values.
- Load the selected agent's applicable project skills or rules before changing their area.
- Treat lint diagnostics as work to resolve. Run the project check command before finishing; instructions and hooks do not replace tests.

## Testing

Pure rules get unit tests beside them (`src/features/dashboard/*.test.ts`). `dashboard-page.test.tsx` renders the real route with `renderRoute("/")` against MSW (`tests/msw/server.ts`, fixtures in `tests/fixtures/usage.ts`) and asserts visible text; polling tests fake only `setInterval` and `Date`. `e2e/` runs Playwright against the built bundle with the gateway routed by `page.route`. Nothing needs to run first and no `.env` is needed. Details in [react-vite testing](docs/guidance/react-vite/testing.md).

- Default to integration tests of observable behavior through public interfaces, with real project modules and storage. Use unit tests for pure logic and a few end-to-end tests for critical journeys.
- Mock only uncontrolled boundaries: third-party services, time and randomness. Match real contracts, including failures; don't mock internal modules.
- Assert outputs, typed errors and user-visible results. Name tests for behavior; avoid private state and internal mock-call assertions.
- A bug fix starts with a reproducing test that fails before the fix. Cover error paths as well as successful operations.
- Await completion or a bounded condition wait, never a guessed sleep. Register listeners before triggering events.
- Isolate state and resources per test or worker; restore globals and close resources. Diagnose flakes as state leaks, races or resource conflicts before changing timeouts.
- Never weaken or skip a test to get green. Read executed and skipped counts; a filter matching no tests proves nothing.

Read [testing](docs/guidance/engineering/testing.md) before writing or changing tests.

## Error handling

Every failed call rejects with `ApiError` (`src/api/errors.ts`, kind `http`, `network` or `decode`). `userMessage` is the one table of sentences the page shows (401 says how to set `ADMIN_KEY`; network and 502 say the gateway is unreachable). The usage query doesn't retry: the next poll is the retry, and a failed poll after a success keeps the last report on screen marked stale.

- Never swallow an error or turn failure into apparent success. Handle it where recovery is possible, or pass it on.
- Use typed errors, stable codes or the project's Result pattern for expected failures. Catch only what you can handle; let unexpected bugs reach the handling boundary.
- Add operation context when wrapping a failure, and preserve the original cause and stack. Observe failures from promises and background tasks too.
- Log an error once, at the boundary that handles it.
- Fail on missing required dependencies. Retry only transient failures when safe and bounded; optional fallbacks must report degraded behavior, never silently return defaults.
- Write actionable messages: what failed, why and the next step when known. Keep secrets and personal data out of messages and logs.
- Release resources on every exit path. Preserve the primary failure if cleanup also fails.

Read [error handling](docs/guidance/engineering/errors.md) before changing failure or recovery paths.

## Debugging

- If a fix hasn't worked after two attempts with no new diagnostic step in between, stop. Write down what you learned, list two or three other root-cause hypotheses, and ask which to pursue. Running a new diagnostic between attempts resets the count.
- Read logs and error output before guessing.

The app logs structured records to the browser console (`VITE_LOG_LEVEL=debug` for more). With the gateway down, the Vite terminal prints `http proxy error` every poll and the page shows "Stale since".

## Build workarounds

Things in the tree that exist to get a build through, not because they are right. Each one says when it can be removed. Re-check them when upgrading the tools involved.

None yet.

## Deferred

Explicitly out of scope for now, so nobody mistakes them for forgotten work.

Spend over time, per-employee drill-down, editing budgets from the page, auth beyond the dev proxy, and a production deploy. See "Out of scope for v1" in the plan.

## Pending user actions

Steps only a human can do (accounts, API keys, DNS, signing identities). Check here before reporting one of these as a problem.

- Set `ADMIN_KEY` in the root `.env`. Confirm: `bun run dev` at the root shows the dashboard with "Live" in the header.

## Deeper context

Read the engineering guidance before writing code; read the other docs when the task needs them.

| Need | Read |
| --- | --- |
| Engineering rules for every agent | [docs/guidance/engineering/](docs/guidance/engineering/index.md) |
| React SPA conventions | [docs/guidance/react-vite/](docs/guidance/react-vite/index.md) |
| What the dashboard shows and why | [plans/dashboard/plan.md](../plans/dashboard/plan.md) |
| Setup, commands, configuration | [README.md](README.md) |
