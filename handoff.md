# Handoff: verifying phase 1

Phase 1 is tagged `phase-1` on `build/spend-gateway`. It delivers `POST /v1/messages`: an employee calls it with their gateway key in the Anthropic Messages format, and the gateway allows the request from their daily allowance, spills it to the company's weekly pool, or blocks it with a 429 that says which limit was hit and when it resets. Allowed requests go to OpenRouter (or the in-process fake for `fake/` models) and their cost is recorded.

This file is how to check that by hand. It takes about ten minutes.

## 1. Before you start

- `OPENROUTER_KEY` is set in `.env`. Only the last request in step 4 needs it.
- Dependencies are installed (`bun install`).
- Port 3000 is free: `on-port 3000` should say nothing is listening.
- Install the VS Code REST Client extension (`humao.rest-client`). The repo recommends it in `.vscode/extensions.json`.

## 2. Run the gate

```sh
git checkout phase-1   # or stay on build/spend-gateway, which is at or after the tag
bun run check
```

Expect lint, typecheck, 141 passing tests across 18 files, and a build, in about 5 seconds. No `.env` is needed for tests, and nothing touches the network; OpenRouter is stubbed at `fetch`.

## 3. Start the server

```sh
bun run dev
```

The log should show the server listening on port 3000. Budgets live in memory and the seed (`seed/company.json`) loads at startup, so restarting the server puts every budget back to zero. Restart before each full run through the requests below.

The demo company is small on purpose so the limits are easy to hit:

| Key | Employee | Tier | Daily allowance | After the allowance |
| --- | --- | --- | --- | --- |
| `key-intern` | Ivy | intern | $0.01 | blocked |
| `key-engineer` | Eli | engineer | $0.01 | company pool, capped at $0.02 a week |
| `key-staff` | Sam | staff | $0.05 | company pool, uncapped |
| `key-disabled` | Dee | intern | | disabled, always 401 |

The company pool is $1 a week. Days reset at 00:00 UTC and weeks at Monday 00:00 UTC.

## 4. Send the requests

Open `http/gateway.http`, choose the "local" environment (Command Palette, "Rest Client: Switch Environment"), and click "Send Request" above each one from top to bottom. The comment above each request says what to expect. Here's the same list with what to look for:

| Request | Expect | What it shows |
| --- | --- | --- |
| `health` | 200 `{"status":"ok"}` | the server is up |
| `staffAllowed` | 200, text "Fake reply." | an allowed request passes the upstream body through |
| `internFirst` | 200 | the allowance check happens before the request, so this one may overshoot: it costs $0.011 of a $0.01 allowance |
| `internBlocked` | 429, `code: budget_exceeded`, message "Daily allowance of $0.01 used. Resets <next 00:00 UTC>.", `budget.reason: personal_allowance_exhausted`, `spentMicros: 11000`, `limitMicros: 10000` | an intern-tier (block) employee is blocked once the allowance is used |
| `engineerPersonal` | 200 | charged to Eli's allowance |
| `engineerSpill1` | 200 | allowance used, so this one comes from the company pool |
| `engineerSpill2` | 200 | pool draws are $0.011, still under the $0.02 cap |
| `engineerCapped` | 429, `budget.reason: pool_cap_reached`, message "Weekly pool cap of $0.02 used...", `spentMicros: 22000` | the pool cap blocks; it resets at the next 00:00 UTC because a fresh allowance unblocks Eli first |
| `noKey` | 401 `unauthorized` | rule 1 |
| `disabledKey` | 401 `unauthorized`, same body as an unknown key | a disabled key can't be told apart from a wrong one |
| `unknownModel` | 400 `unknown_model` | a model with no price is rejected before anything is forwarded |
| `missingModel` | 400 `bad_request`, an issue at `json.model` | body validation |
| `upstreamError` | 529 with the provider's error body | provider errors pass through unchanged and aren't charged |
| `realInference` | 200 with a real DeepSeek reply | the OpenRouter path works end to end with the server-side key |

The 429 body also has a `requestId` that matches the `x-request-id` response header and the server log line for that request.

The fake upstream takes test headers so you can try other cases: `x-fake-output-tokens` sets the cost (10,000 output tokens is $0.011), `x-fake-status` sets the response status, `x-fake-usage: report` makes an error response carry usage so it gets charged, `x-fake-delay-ms` slows it down, and `x-fake-unreachable: 1` simulates a provider that can't be reached (expect 502 `upstream_unavailable`).

## 5. Things worth trying beyond the file

- Send `staffAllowed` five or six times with `x-fake-output-tokens: 10000` added. Sam is allowed every time: the first few from personal, then from the uncapped pool.
- Send malformed JSON with a valid key. Expect 400 `bad_request`. Send it with a bad key instead and expect 401, because the key is checked before the body.
- Run the 429 requests a minute or so before 00:00 UTC and again just after. The allowance refills at midnight, but Eli's pool draws carry over until Monday.

## 6. Code to read while it runs

`walkthrough` output from landing phase 1, kept here so you have the lines to check in one place:

- `src/budget/decide.ts`: the budget rules in order. Rule 3 checks the company pool, rule 4 the daily allowance, rules 5 and 6 the pool or the block. The checks are strict `<`, so spend exactly at the allowance moves on to the pool.
- `src/budget/spend.ts`: the three spend sums. Each counts only allowed records inside a half-open period, so a clock set back can't count future records.
- `src/gateway/service.ts`: one request end to end. The timestamp is taken once before forwarding (line 67), a blocked request is recorded before the 429 (line 82), and a response with no usage isn't charged (line 90).
- `src/gateway/messages-route.ts:34`: the key check runs as middleware, before body validation.
- `src/upstream/openrouter.ts`: what's sent to OpenRouter (only the Bearer key, `content-type` and `anthropic-*` headers), and reading its reported cost.
- `tests/gateway-http.test.ts`: the requirements as HTTP tests. Its `describe` blocks read as the spec.

## Known gaps in phase 1

- State is in memory and resets on restart. The store sits behind an async interface so a database can replace it later.
- Two requests in flight at once can both pass the check and both overshoot. The spec accepts this and a test pins it.
- No admin view or controls yet; those are phases 2 and 3.
- Errors use the gateway's own envelope, not Anthropic's shape, so the Anthropic SDKs show them as generic errors. That's phase 4. Streaming is phase 5.

## Phase 2 status

Phase 2 (admins see spend per employee) is being built in a separate worktree at `.claude/worktrees/phase-2` on branch `build/spend-gateway-p2`, so it doesn't change this checkout while you verify. It will need `ADMIN_KEY=dev-admin-key` in `.env`; without it the admin routes answer 401 and phase 1 runs as before.
