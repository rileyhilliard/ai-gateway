---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
---

# Error handling (TS/JS)

Load `ce:handling-errors` and read its `references/typescript-react.md` before writing catch blocks, error types or error messages. For error text a user sees, follow the UX Writer persona in `ce:writer` (`references/ux-writer.md`).

- Settle in the grill whether failures throw typed errors (an `Error` subclass with a `code` literal) or return a result (`{ ok: true, value } | { ok: false, error }`), then use one convention everywhere.
- A message names the input at fault and what was expected: `amount must be a positive integer of cents, got -5`.
- Rethrow with `{ cause }` so the original error survives. Caught values are `unknown`; narrow with `instanceof` before reading them.
- No empty `catch`, and no fallback value that hides a failure to keep a demo green.
- Await or return every promise. A floating promise turns a failure into an unhandled rejection nobody sees.
- Handle the edge cases the interviewer named, and tell the user about unhandled ones instead of guarding against everything imaginable.
