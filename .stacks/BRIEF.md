# Build spend-gateway: Hono API on Node

## Start here

stacks wrote the starter files and this brief and ran nothing. Next:

1. Install the declared packages, latest versions:

   ```sh
   bun add hono @hono/node-server @hono/zod-openapi zod pino
   bun add -d typescript @types/node @biomejs/biome vitest @vitest/coverage-v8 pino-pretty
   ```

2. Run `stacks verify` (the code checks); fix the code, never the steps, until it is `green`.
3. Do what the Stack and Fragment sections ask, taking the Decisions, and replace every `stacks:fill` marker.
4. Done: `stacks verify --all`, which adds the hygiene checks, exits 0 with outcome `green`. Then follow After green.

Everything below is reference.

## Facts

- Stack: Hono API on Node (`hono-api`)
- Project slug: `spend-gateway`; env prefix: `SPEND_GATEWAY`
- Fragments: `agent-ops`, `claude-harness`
- Preset: lean (no default fragments)
- Target agents: claude
- Project root: the directory containing `.stacks/`. Run every command from there.
- Files stacks wrote:
  - `.claude/` (19 files)
  - `.editorconfig`
  - `.env.example`
  - `.gitignore`
  - `.stacks/` (4 files)
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `biome-plugins/boundaries.grit`
  - `biome.json`
  - `docs/guidance/engineering/` (5 files)
  - `docs/guidance/hono-api/` (4 files)
  - `package.json`
  - `scripts/README.md`
  - `scripts/prepare.ts`
  - `src/` (18 files)
  - `tests/` (5 files)
  - `tsconfig.json`
  - `tsconfig.tools.json`
  - `vitest.config.ts`

## Versions

- Nothing here pins a version, on purpose. Let the package manager resolve the latest stable versions that work together; don't pin from memory.
- Prefer each tool's official generator or init command over writing its files by hand.
- Check current docs, `--help` and the installed types before writing config or calling an API; flags and config keys change between releases.

## Ground rules

- Run generators non-interactively, into their own subdirectory or a temporary directory you move the result from. Never run one into the populated project root.
- The project root is a new git repository with no commits. Skip generators' own git setup.
- Files stacks wrote are starting points: adapt them, don't delete them. Update any that fail against what you installed; never pin older versions.
- Keep `AGENTS.md` accurate: real commands, implemented behavior.
- If stacks printed a telemetry notice, tell the user once, in one sentence, including how to turn it off.
- Keep `.stacks/NOTES.md` here as you work. It and the brief are git-ignored, so git worktrees lack them:
  - Under `## Findings`, add a line whenever this brief is ambiguous, wrong, names something that doesn't exist or made you guess, and whenever an instruction stopped you making a mistake.
  - Under `## Asked`, add a line with the time whenever you ask the user something or the user tells you something unprompted. An empty `## Asked` means no interventions.

## Decisions

Use each default below without asking, and list what you chose in your final summary.

- Node version: current LTS (default), recorded in .node-version. Node runs the server and Vitest; Bun installs, runs scripts and bundles.

## Dependencies and tools

Packages: see Start here, step 1.

Tools:

- `bun`: found on PATH
- `node`: found on PATH
- `git`: found on PATH

## Stack: Hono API on Node (`hono-api`)

### What stacks wrote

A JSON API with one payload, an in-memory notes resource (list, get, create). `src/main.ts` reads the environment and signals; `src/server.ts` is the only module that touches Node's HTTP server; `src/app.ts` builds the whole API as a platform-free fetch handler with request ids, the request log, a body limit, `/openapi.json`, and the not-found and error handlers. `src/config.ts` validates settings with zod, `src/errors.ts` holds the one status table and the error envelope, `src/logging.ts` the pino logger and request log, and `src/router.ts` the `createRouter()` every route module uses. Tests run on Vitest: unit tests beside the code, `tests/http-contract.test.ts` through `app.request()`, `tests/server.test.ts` over a real port. The configs, package scripts, a Biome boundary plugin and `docs/guidance/hono-api/` ship too. Read the code before extending it.

Link `docs/guidance/hono-api/index.md` from AGENTS.md.

### Layout

- `src/schemas/<resource>.ts`: zod schemas with `.openapi()` names. `src/services/<resource>.ts`: the store interface and its in-memory implementation. `src/routes/<resource>.ts`: `createRoute` declarations and handlers, mounted in `app.ts`.
- `tests/helpers/app.ts`: `testApp()`, a fresh app with captured log records. `biome-plugins/boundaries.grit`: the boundary rules, probed by `tests/boundaries.test.ts`.

### Setup

1. Add every declared app and dev dependency at its current release with `bun add` and `bun add -d`. Check `@hono/zod-openapi`'s peer range for zod and hono before adding them, and match `@types/node` to the chosen Node major.
2. Write the Node LTS to `.node-version` and the Bun version to `packageManager`.
3. Run `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build`. Where an installed release rejects shipped code or config (a renamed export, a moved option), update it from that release's declarations, keeping every check, lint rule and assertion.
4. Fill the README's `stacks:fill` markers and AGENTS.md (commands, a single-file test example, the boundaries, the guidance link), then run `stacks verify` until green.

### Conventions

The shipped code keeps these; new code does too. `docs/guidance/hono-api/api.md` has the detail.

- Every route is a `createRoute()` registered with `.openapi()` on a router from `createRouter()`, so validation and `/openapi.json` can't drift. Handlers read input only through `c.req.valid(...)`.
- Errors: throw an `AppError` subclass; `app.onError` renders `{ "error": { "code", "message", "requestId", "issues"? } }` with the status from `errorTable`. A new failure adds a row there and a contract test.
- `node:*`, `@hono/node-server` and `process` stay in `src/main.ts` and `src/server.ts`; `console` stays out of `src/`; `z` comes from `@hono/zod-openapi`. The Grit plugin fails lint on a break.
- Log with the pino logger, flat fields, never bodies, headers, query strings or tokens. The request log records method, route pattern, status, duration and request id.
- Routes live under `/v1`; `/healthz` and `/openapi.json` stay outside it. A create returns 201 with `Location`; a list takes `limit` and `cursor` and returns `nextCursor`.

### Testing

Unit tests sit beside the code (`src/**/*.test.ts`). `tests/http-contract.test.ts` drives the real app with `app.request()` and asserts statuses, envelopes, headers and request records; verify runs it on its own. `tests/server.test.ts` serves on port 0 and calls it with `fetch`. A new endpoint adds its success, every error status it returns, and its validation edges to the contract tables. Details in `docs/guidance/hono-api/testing.md`.

### Commands

`package.json` wires every declared command; mirror them in AGENTS.md with a scoped example such as `bun run test src/config.test.ts`. `dev` stays in the foreground: run it in the background, or use `bun run build && bun run start` on a free `PORT_API`, then stop it. `start` serves the last build.

### Gotchas

- The validation hook belongs to each `OpenAPIHono` instance, not to the app a router is mounted on. A router made with `new OpenAPIHono()` answers bad input with Hono's plain-text 400; use `createRouter()`.
- `c.req.json()` throws on a malformed body and skips the schema; declare the body in `createRoute()` and let the validator parse it.
- Hono answers a wrong method on a declared path with 404, not 405; the contract tests pin that.
- Bun runs Hono natively, which tempts a switch of runtime. Run Vitest with `bun run test`, run the server on Node with the declared scripts, and omit `--bun`.
- Node runs `src/*.ts` by stripping types, so relative imports keep their `.ts` extension and the code uses only erasable syntax (no enums, no parameter properties).

## Fragment: AGENTS.md and agent guardrails (`agent-ops`)

One canonical instruction file for every coding agent, `AGENTS.md`, plus a Claude Code adapter.

### What to add

**`AGENTS.md`** is a skeleton. Fill it last, once verify is nearly green, from the project as built:

- Replace each `stacks:fill` comment with real content; empty sections get "None yet."
- Commands match the real Makefile or scripts, each run once, including a single-test-file command. The architecture map lists only directories that exist.
- **Build workarounds** lists every pin, patch, disabled rule, or hack you added to get green, with when to remove it. **Deferred** and **Pending user actions** record what you left out and what only the user can do.
- Under about 200 lines. Other fragments' sections go under their own `##` near related ones (database after Architecture map, CI and deploy before Deferred).

**Engineering guidance:** read `docs/guidance/engineering/` (tests, architecture, errors, readable code) before writing code, and keep `AGENTS.md`'s Conventions, Testing and Error handling consistent with it.

**Hooks** deny only destructive or irreversible work (deleting root, home or the project, discarding work or history, force pushes, dropped tables, publishing, cloud deletes, `curl | sh`, secret or `.env` writes) and fail open. Conventions go in guidance and lint, never a denying hook. A block means ask the user, never work around it.

**Claude Code adapter** (when Claude is a target): `CLAUDE.md` imports `AGENTS.md` via `@AGENTS.md` (never remove the line). `.claude/settings.json` wires the hooks; other fragments deep-merge into it. Replace `.claude/README.md`'s `stacks:fill` row with one row per shipped hook (`claude-readme-filled` checks).

Once Commands are settled, allow the project's non-destructive commands (lint, format, typecheck, test, single test file) in `.claude/settings.json` as `Bash(<cmd>)` / `Bash(<cmd> *)`. Never allow deploy, publish, release, migrate or deletes. Allow rules already merged into `.claude/settings.json` are approved.

**Other agents** run the shell guards from `.claude/hooks/`, so keep it whatever the targets. Codex runs project hooks only after the user trusts the project and approves each in `/hooks`: list that under Pending user actions.

`hooks-smoke` runs `.claude/hooks/smoke.sh`, the project's only hook test: a deny and a near miss per guard, and every hook config parses and wires real files. A hook you add gets a case there. If it fails, fix the hook or wiring, never the script.

Claude Code asks the user before any edit under `.claude/` or to `lefthook.yml`; if denied, finish the rest, then ask once for all of them with exact content.

With a linter (a formatter alone doesn't count), confirm `lint-on-write.sh` reports a deliberate error, then revert; if silent, check the linter is where the hook looks (`.venv`, `node_modules/.bin`, PATH). On Stop, `format-changed.sh` formats this session's files. With biome or eslint, add `.claude/worktrees/` to `.gitignore`.

## Fragment: Claude Code TypeScript hooks (`claude-harness`)

The shared TypeScript hook helper `_lib.ts` ships for every target; stack guards are bash on agent-ops' `_lib.sh`. Claude's remaining harness is adapter-only; the instructions below about Claude apply when it is a target.

When Claude is a target, its adapter adds incremental type checking after each edit. Stacks and apps own their specialized hooks and permissions; each contribution merges its agent's hook config and wires only files it owns. Hooks follow agent-ops's policy: deny only destructive work or a command that would hang the session; conventions go in guidance and lint.

Include `.claude/hooks/` in TypeScript checking. Helpers use Node APIs even though Bun executes them. A stack can supply `.claude/hooks/before-typecheck.ts` for generated types; the typecheck hook awaits it before tsc. Keep it bounded and quiet when tools are absent.

Populate `.claude/README.md` with the actual hooks, rules, commands, skills, and agents. Add project commands to permissions only when safe to run without another prompt; leave paid and live third-party operations interactive. Each hook appears exactly once in merged settings, and a hook you add gets a case in `.claude/hooks/smoke.sh`.

## Definition of done

`stacks verify --all` runs these steps, in this order; `stacks verify` skips the ones marked hygiene:

| Step | Phase | Layer | Expects |
|---|---|---|---|
| `install` | setup | install |  |
| `lint` | check | lint |  |
| `typecheck` | check | typecheck |  |
| `test` | check | test |  |
| `http-contract` | check | test |  |
| `build` | check | build |  |
| `readme-filled` | check | check | hygiene |
| `agents-md-filled` | check | check | hygiene |
| `claude-md-imports-agents` | check | check | hygiene |
| `claude-readme-filled` | check | check | hygiene |
| `hooks-smoke` | check | check | hygiene |
| `api` | serve | serve | `http://localhost:${PORT_API}/healthz` within 60s |

Each step's command, exactly as verify runs it:

```sh
# install
bun install
# lint
bun run lint
# typecheck
bun run typecheck
# test
bun run test
# http-contract
bun run test tests/http-contract.test.ts
# build
bun run build
# readme-filled
test -s README.md && ! grep -n 'stacks:fill' README.md
# agents-md-filled
test -s AGENTS.md && grep -q '^## Commands' AGENTS.md && ! grep -n 'stacks:fill' AGENTS.md
# claude-md-imports-agents
test ! -f CLAUDE.md || grep -qx '@AGENTS.md' CLAUDE.md
# claude-readme-filled
test ! -f .claude/README.md || ! grep -n 'stacks:fill' .claude/README.md
# hooks-smoke
bash .claude/hooks/smoke.sh
# api
bun run start
```

### Commands

| Command | Purpose |
|---|---|
| `dev` | Run the server from source on Node, restarting on change, with readable logs |
| `build` | Bundle the server into dist/main.js |
| `start` | Run the built server |
| `typecheck` | Run tsc over the app, tests and tooling |
| `lint` | Run Biome checks, including the boundary plugin |
| `format` | Apply Biome formatting and safe fixes |
| `test` | Run Vitest once |
| `test:watch` | Watch Vitest tests |
| `coverage` | Run Vitest with coverage thresholds |
| `check` | Run lint, typecheck, tests and the build |
| `clean` | Remove build and coverage output |
| `prepare` | Install git hooks outside CI |

### Environment

| Variable | Default |
|---|---|
| `PORT_API` | `3000` |

If a port is busy, set its variable when you run verify: `PORT_API=<free port> stacks verify`.
Don't change the defaults in `.stacks/manifest.json`: `env` is part of the definition of done, and editing it fails verify.

### Rules

- Run `stacks verify --all` from the project root. Done is exit 0 with outcome `green`.
- A command a step calls that doesn't exist yet is yours to create, and it must do real work: `test` runs the tests, `lint` lints.
- Don't weaken the definition of done. That means: editing the steps, `env` or anything else in `.stacks/manifest.json`; making a command exit 0 without doing its job (`|| true`, `exit 0`, an empty target, a script that only echoes); deleting, skipping or excluding tests to get a pass; flags that pass with no tests; lowering a lint or typecheck setting until it reports nothing; serving a stub instead of the app the probe should reach. Changed steps fail verify; the rest shows in the diff.
- Stop any dev server you started before running verify, or its port is taken and the serve step fails.
- A serve step's command stays in the foreground until it is stopped; it doesn't start a daemon and exit. Verify starts it, probes it and stops it.
- Run verify with your shell tool's longest timeout. A full run includes installs and can take minutes; a tool timeout that kills it looks like a failure that isn't one.
- When verify fails, read the step name, command and output tail it reports, fix the code or config that step exercises (not the step), and run it again.
- If verify fails with `VerifyChanged` (exit 5, "Verify steps changed since they were recorded"), stop. Don't edit `.stacks/manifest.json` back and forth, and don't run `stacks verify --accept-changes` yourself (it refuses agents). Tell the user which steps or settings it says changed, and that only they can accept that, by running it in their own terminal, or undo it. Then wait.

### Manual QA

Verify only checks exit codes and HTTP probes. Run the dev, test and build commands yourself, fix the warnings in their output, and exercise what you built.

### After green

1. Check that `AGENTS.md` and `README.md` describe the project you built, with real commands.
2. Review your own diff against AGENTS.md and the project's guidance, fix what you find, and rerun `stacks verify --all`.
3. Commit everything with the message `chore: scaffold spend-gateway from the hono-api stack`.
4. End with a short summary: what you built, the decisions you took (with their defaults), anything you couldn't do, and a pointer to `.stacks/NOTES.md` for what this brief got wrong.
