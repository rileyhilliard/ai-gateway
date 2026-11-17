---
paths:
  - "**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
  - "**/__tests__/**"
  - "tests/**"
  - "e2e/**"
---

# Testing (TS/JS)

Load `ce:writing-tests` and read its `references/typescript-react.md`. For timers, polling or async UI, read `references/waiting-typescript.md`. For how many cases a behavior needs, read `references/test-value.md`.

In an interview the tests are the evidence that agent output was checked before it was accepted, so each test proves a behavior a user or caller would recognize, running the way it runs for real. Contrived unit tests of internals don't count as that evidence: a test that calls a private helper, stubs the module next door, or asserts that one function called another passes while the feature is broken.

- Write each phase's tests before its implementation, from the requirement answers in the plan. One `describe` per requirement and `it` names that state the behavior in the interviewer's words ("rejects a booking that overlaps an existing one"), so the test list reads as the spec.
- Drive the system through the entry point a real caller uses: the HTTP route through the app's request handler, the component rendered with Testing Library and driven by user events, the CLI with real arguments, the library's exported API. Assert on what that caller observes (the response, the rendered text, the returned value, the stored state), not on internal calls.
- Use real collaborators. The project's own modules are never mocked; use a real in-memory or temp-dir database, a real server on a free port, and the real DOM environment. Fake only a third-party service you can't run locally, at its network boundary (MSW), and control time with fake timers rather than sleeps.
- Turn every example in the prompt into a test with the same inputs and outputs, then add the edge cases the interviewer named.
- A pure function with real branching logic can get direct tests, but only alongside a behavior test that exercises it through the entry point.
- Assert on errors by type or message (`toThrow(SomeError)`, `toThrow(/expected/)`), not just that something threw. No snapshots for logic.
- Never delete, skip, `.only` or loosen a test to make it pass. If a test looks wrong, stop and tell the user which requirement it encodes and why it seems wrong.
- Run the single file you're working on while iterating and the full gate before each commit.
