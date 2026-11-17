# spend-gateway

Instructions for coding agents working in this repository. Keep this file under about 200 lines: it is loaded at the start of every session. Put detail that matters only for one area in a doc and link it from Deeper context.

## Overview

A spend gateway for companies: employees call an Anthropic Messages endpoint with a personal key, and the gateway allows, spills to a shared weekly pool, or blocks each request by the employee's spend tier, then forwards to OpenRouter and records the cost. TypeScript on Node with Hono, zod and Vitest; Bun installs and runs scripts. Product spec: [problem-statement.md](problem-statement.md). Build plan: [plans/spend-gateway/](plans/spend-gateway/README.md).

## Commands

Run these from the repo root. They are the only supported way to build, test, and run the project; if a command here is wrong, fix it here in the same change.

| Command | What it does |
| --- | --- |
| `bun run dev` | Run the server from source on Node, restarting on change, with readable logs |
| `bun run build` | Bundle the server into dist/main.js |
| `bun run start` | Run the built server |
| `bun run typecheck` | Run tsc over the app, tests and tooling |
| `bun run lint` | Run Biome checks, including the boundary plugin |
| `bun run format` | Apply Biome formatting and safe fixes |
| `bun run test` | Run Vitest once |
| `bun run test:watch` | Watch Vitest tests |
| `bun run coverage` | Run Vitest with coverage thresholds |
| `bun run check` | Run lint, typecheck, tests and the build |
| `bun run clean` | Remove build and coverage output |
| `bun run prepare` | Install git hooks outside CI |
| `bun install` | Install dependencies |
| `bun run test src/config.test.ts` | Run one test file; add `-t "<name>"` for one test |

The gate is `bun run check` (about 4s).

## Architecture map

```
src/        the app: main.ts and server.ts touch Node; app.ts builds a platform-free fetch handler
  budget/   pure budget rules (periods, pricing, limits, spend sums, the allow/spill/block decision)
  store/    Store interface and the in-memory implementation
  seed/     seed JSON validation
  upstream/ fake and OpenRouter upstreams
  gateway/  POST /v1/messages: key, decide, forward, record
tests/      HTTP contract and server tests, plus helpers
http/       REST Client requests for manual testing
seed/       demo company data
plans/      build plan, one file per phase
```

A request flows: route, gateway service, store and budget decision, upstream, usage record. The `budget/`, `store/`, `seed/`, `upstream/` and `gateway/` folders are created by the phase 1 scaffold; see [the spec](plans/spend-gateway/spec.md) for each module's responsibility.

## Agent harness

Claude Code only. Hooks live in `.claude/hooks/` and are wired in `.claude/settings.json`; [.claude/README.md](.claude/README.md) lists them. Skills live in `.claude/skills/`. Rules in `.claude/rules/` load for matching paths: `hono-api/` covers the API, tests and verification; `code-style.md`, `error-handling.md`, `testing.md` and `writing.md` are the interview workspace's own.



## Conventions

- Money is integer micro-dollars (`Micros`) everywhere inside the app; dollars appear only at the seed and admin edges.
- Time comes from an injected `Clock`; budget periods are UTC.
- `process`, `node:*` and `@hono/node-server` stay in `src/main.ts` and `src/server.ts`; Biome's boundary plugin enforces it.

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

Unit tests sit beside each module (`src/**/*.test.ts`) and run against real modules. `tests/http-contract.test.ts` and the gateway HTTP tests drive the app with `app.request()`; `tests/server.test.ts` uses a real port. The upstream is faked with `src/upstream/fake.ts` (any `fake/` model id); OpenRouter tests stub `fetch` and never hit the network. Nothing needs to run first, and no `.env` is needed for tests.


- Default to integration tests of observable behavior through public interfaces, with real project modules and storage. Use unit tests for pure logic and a few end-to-end tests for critical journeys.
- Mock only uncontrolled boundaries: third-party services, time and randomness. Match real contracts, including failures; don't mock internal modules.
- Assert outputs, typed errors and user-visible results. Name tests for behavior; avoid private state and internal mock-call assertions.
- A bug fix starts with a reproducing test that fails before the fix. Cover error paths as well as successful operations.
- Await completion or a bounded condition wait, never a guessed sleep. Register listeners before triggering events.
- Isolate state and resources per test or worker; restore globals and close resources. Diagnose flakes as state leaks, races or resource conflicts before changing timeouts.
- Never weaken or skip a test to get green. Read executed and skipped counts; a filter matching no tests proves nothing.

Read [testing](docs/guidance/engineering/testing.md) before writing or changing tests.

## Error handling

Throw an `AppError` subclass from `src/errors.ts`; `app.onError` renders the envelope with the status from `errorTable`. Budget outcomes are values (`Decision`), not exceptions. The full error model is in [the spec](plans/spend-gateway/spec.md#error-model).


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

`bun run dev` logs pino JSON through pino-pretty to the terminal. Set `LOG_LEVEL=debug` for more.

## Build workarounds

Things in the tree that exist to get a build through, not because they are right. Each one says when it can be removed. Re-check them when upgrading the tools involved.

| Where | What and why | Remove when |
| --- | --- | --- |
| `package.json` | `@types/node` held at major 24 to match `.node-version` | Node major changes |

## Deferred

Explicitly out of scope for now, so nobody mistakes them for forgotten work.

See "Won't have" in [problem-statement.md](problem-statement.md) and the later phases in [plans/spend-gateway/](plans/spend-gateway/README.md). No CI or git hooks (lean preset).

## Pending user actions

Steps only a human can do (accounts, API keys, DNS, signing identities). Check here before reporting one of these as a problem.

- Put the OpenRouter key in `.env` as `OPENROUTER_KEY`. Confirm: the real-inference request in `http/gateway.http` returns 200. (Done.)

## Deeper context

Read the engineering guidance before writing code; read the other docs when the task needs them.

| Need | Read |
| --- | --- |
| Engineering rules for every agent | [docs/guidance/engineering/](docs/guidance/engineering/index.md) |
| Product spec | [problem-statement.md](problem-statement.md) |
| Build plan and phase status | [plans/spend-gateway/README.md](plans/spend-gateway/README.md) |
| Hono API conventions | [docs/guidance/hono-api/index.md](docs/guidance/hono-api/index.md) |
