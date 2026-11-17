---
name: setup-stack
description: Sets up the toolchain once the interview prompt or starter code arrives, adds a single fast gate command, and fills the Commands table in CLAUDE.md. Use when the prompt or starter code has landed, when asked to set up the project, pick a stack, or add tests and typecheck, or before /ce:build when CLAUDE.md still shows unset commands.
---

# Set up the stack

The goal is one command that runs every check, finishes in seconds, and is recorded in CLAUDE.md so later phases and lanes all use the same gate.

1. Look at what's there. Read any starter code and its manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` and so on) and its existing scripts. If the starter has a test runner and linter, use them rather than adding new ones.
2. If there's no starter, ask the user which language the interviewer expects. Suggest TypeScript with strict `tsc` and Vitest as the default, since that's the user's usual setup.
3. Make sure a single gate command exists that runs the tests plus typecheck or lint, for example a `gate` script of `vitest run && tsc --noEmit`. Add only what the gate needs; dev dependencies are fine, runtime dependencies are the user's call.
4. Find the syntax for running one test file and one test by name, and the command that runs or demos the app.
5. Replace the `_unset_` cells in the Commands table in CLAUDE.md with real commands. Add allow rules to `.claude/settings.json` for the gate and single-test commands only, so background lanes don't stall on a permission prompt.
6. Run the gate once and report how long it took. Then commit as `chore: set up <stack> toolchain` so the next phase starts from a clean tree.

Don't reformat or restructure the starter code during setup. The interviewer will expect it to look the way they left it.
