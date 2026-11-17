---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
---

# Code style (TS/JS)

The user explains every landed line to the interviewer, so code has to read top to bottom without a guide. Starter-code conventions win over this file where they differ, and the starter's untouched lines stay untouched.

Load `ce:architecting-systems`. Read its `references/structure.md` before creating files or folders, and `references/boundaries.md` before adding a module other modules import.

## File organization

- One module per domain concept, named after it (`cart.ts`, `pricing.ts`), not by technical role (`utils.ts`, `helpers.ts`, `types.ts` holding everything).
- A module's types live in that module. A shared `types.ts` holds only types used by several modules.
- Within a file: imports, types, constants, exported functions, then private helpers. The public surface reads first.
- Named exports only, except where the framework requires a default (route modules, pages). No barrel files beyond the package entry point.
- Split a file when it has two unrelated reasons to change, not when it gets long.

## Comments and JSDoc

- Start each module with a short `/** ... */` block: what it owns, and anything it deliberately leaves to another module.
- Give every export a JSDoc block. Its first sentence says what it is or does in the problem's terms. Add `@param` only when the name and type don't say enough, `@returns` when the return value needs explaining, `@throws` for each error it can raise, and `@example` when usage isn't obvious. Don't repeat types in braces; TypeScript already has them.
- Inline comments follow the Engineer persona in `ce:writer` (`references/engineer.md`, Code Comments): explain why (a constraint, an interviewer requirement, a rejected alternative), never what. Refactor to a better name before writing a comment. No commented-out code.

## TypeScript

- Model the data first and say in the plan what's stored and what's derived. Store the minimum.
- Rule out impossible states with discriminated unions and string literal unions, not sets of booleans or `enum`.
- No `any`. Take `unknown` at boundaries (`JSON.parse`, caught errors, external input) and narrow with `typeof`, `in`, `Array.isArray` or a type guard. No `as` casts or `!` assertions to quiet the checker; if one is truly needed, a comment says why it's safe.
- Explicit return types on exported functions. Inside a function, let inference work.
- Don't mutate arguments. Use `readonly` on inputs where it documents intent, and `const` by default.
- Use `Map` and `Set` for dynamic keys, not plain objects.

## Shape

- Pure core, I/O at the edges (network, storage, clock, randomness, DOM), so the core tests with plain values and no mocks.
- Parse and validate input where it enters, then pass typed values inward.
- Return early on guard cases instead of nesting the main path.
- Names state what something is: `expiresAt`, `pendingOrders`, `isExpired`. Avoid `data`, `info`, `result`, `tmp`, `handle`, `manager`.
- No abstraction without a second real use, and no options or extension points nobody asked for.

Each phase's diff holds one capability. Leave out drive-by renames, refactors and formatting churn; mention them to the user instead.
