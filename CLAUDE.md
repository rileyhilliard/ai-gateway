# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Workspace for a live, AI-assisted technical interview, written in TypeScript or JavaScript. The prompt and exact stack arrive during the interview. The interviewer grades the process as much as the result: requirements before code, an early working baseline, tests before accepting agent output, and code the user can explain line by line. So favor plain code and small diffs over clever or compact ones.

Stack conventions, boundaries and commands from the `hono-api` starter live in `AGENTS.md`:

@AGENTS.md

## Commands

| Task | Command |
| --- | --- |
| Full gate (tests plus typecheck or lint) | `bun run check` (about 4s) |
| One test file or test name | `bun run test src/config.test.ts`, add `-t "<name>"` for one test |
| Run or demo the app | `bun run dev` in the background, then the requests in `http/*.http` |

## Workflow

Builds run through `/ce:build <prompt> <timebox>` (ce plugin, enabled in `.claude/settings.json`). On top of it:

- Phrase grill questions so the user can read them aloud to the interviewer, each with a recommended default. Record the answers in the plan.
- Build phases inline unless lanes have disjoint files and enough work to justify a merge.
- After each phase lands, run the `walkthrough` skill. Commit as `phase N: <capability that now works>`.

## CLIs on this machine

For awareness; each has `--help`.

- `foreman`: delegates coding tasks to Codex in git worktrees and supervises them (`foreman` skill).
- `rr`: syncs code to remote machines and runs commands there; `rr run --local` runs locally under a machine-wide lock (`rr:rr` skill).
- `stacks`: starts projects from verified starter stacks.
