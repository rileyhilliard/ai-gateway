# Build: Spend Gateway

Started: 2026-11-17 10:53 CST. Timebox: none given. Landing branch: `build/spend-gateway`.
Stack: `hono-api` from `stacks` (Hono on Node, zod routes, Vitest, Biome, Bun scripts).
Inference: OpenRouter's Anthropic Messages endpoint, key in `.env` as `OPENROUTER_KEY` (gitignored). Manual requests: `.http` files for the VS Code REST Client extension, in `http/`.
Gate: `bun run check` (lint, typecheck, tests, build). Filtered tests: `bun run test <file>`. Typecheck: `bun run typecheck`. All three are from the stack's manifest; `setup-stack` confirms them and records the gate's timing.
Runner: plain commands.
Worktree setup: `ln -s <main checkout>/node_modules node_modules`.
Scaffold commits: phase 1 `6681535`.

Product spec: [problem-statement.md](../../problem-statement.md). Build spec, error model and contracts: [spec.md](spec.md).

## Phases

| Phase | Capability | Depends on | Status | Tag |
| --- | --- | --- | --- | --- |
| [1](phase-1-gateway-budgets.md) | The gateway enforces tier budgets (MVP), with real inference through OpenRouter | none | done (`phase-1`) | |
| [2](phase-2-usage-view.md) | Admins see spend per employee | 1 | in progress (`build/spend-gateway-p2`) | |
| [3](phase-3-admin-controls.md) | Admins change budgets and keys, with a demo clock | 2 | in progress (`build/spend-gateway-p3`) | |
| [4](phase-4-anthropic-errors.md) | Anthropic-shaped errors for real clients | 1 | planned | |
| [5](phase-5-streaming.md) | Streaming, so Claude Code works through the gateway | 4 | planned | |
| [6](phase-6-percent-of-pool.md) | Percent-of-pool allowances | 3 | planned | |
| [7](phase-7-project-tags.md) | Project tags and spend by project | 2 | planned | |

Phase 1 has full lane briefs and test cases. Later phases get theirs while the phase before them runs. Not planned in detail: configurable reset periods and time zones, coding vs prototyping categories.

## Log

- Branching: all work happens on the feature branch `build/spend-gateway`, created from the unborn `main` before any commit. Coding-agent lanes each run in their own git worktree on a `build/spend-gateway-<lane>` branch cut from the scaffold commit, and merge back with `--no-ff`. The main checkout stays on `build/spend-gateway`. `main` gets nothing until the user asks to merge.
- The first commit on `build/spend-gateway` includes the untracked planning files (`.claude/`, `.gitignore`, `CLAUDE.md`, `plans/`, `problem-statement.md`). Worktrees need that commit to exist.
- Toolchain: `hono-api` lean preset, gate `bun run check` at about 4s. Commits `7ab0701` (plan) and `cde8d75` (toolchain).
- Plan DA (fast, 5 findings), all applied in the scaffold: error codes and the `budget` envelope field added to `errors.ts`; the notes sample removed and lane b's pattern reference dropped; `UpstreamUnavailableError` defined concretely in `errors.ts`, and a missing tier tested as a 500; the fake upstream moved from lane b to lane c and the seed values written into the spec; tests added for 401-before-400, malformed JSON, a $0 pool cap and spend exactly at the allowance. The invalid-seed startup exit stays untested, since `main.ts` is outside coverage by the stack's design.
- Rule 1 runs as route middleware so a bad key is a 401 even when the body is invalid.
- Phase 1 landed: lanes a (opus), b and c (sonnet) merged clean, no lane sent back. Accepted lane choices: seed cross-field checks run only after the shape check passes; empty-string ids accepted; non-numeric `x-fake-*` headers fall back to defaults; `x-fake-unreachable` fails before any delay; an empty `OPENROUTER_KEY` counts as missing; block tiers skip summing pool draws.
- Phase 1 review of lane a (no spec violations): spend sums now use a half-open period so records dated after a set-back clock don't count; tests added for a week spanning New Year, `next*` under TZ, a Chicago instant on a different local day, and a $0 allowance override; the pool-cap block is built inline like the other two.
