# spend-gateway

A spend gateway for companies that give employees access to AI models. Each employee calls an Anthropic Messages endpoint with a personal key, and the gateway checks that request against their budget: it allows it from their daily allowance, lets it spill over into a shared weekly company pool, or blocks it with a 429 that says which limit was hit and when it resets. Allowed requests go on to OpenRouter, and their cost is recorded so an executive dashboard can show where the money goes.

This guide takes you from a fresh clone to sending requests and watching the dashboard update, in about five minutes.

## What you need

- [Bun](https://bun.sh) 1.4 or later. It installs dependencies and runs the scripts.
- Node 24 (the version is pinned in `.node-version`). The gateway itself runs on Node.

An OpenRouter API key is optional. Without one, everything in this guide still works, because requests for models whose id starts with `fake/` are answered by a built-in fake provider that costs nothing.

## Setup

Install dependencies for the gateway (the repo root) and for the dashboard (`web/`):

```sh
bun install
cd web && bun install && cd ..
```

Create your local settings file from the example:

```sh
cp .env.example .env
```

Open `.env` and set these:

| Variable | Set it to | Why |
| --- | --- | --- |
| `ADMIN_KEY` | `dev-admin-key` | The key for the admin API. The dashboard reads spend through the admin API, so without it the dashboard can't load. It must be at least 8 characters, and `dev-admin-key` is the value the `http/admin.http` requests use. |
| `DEMO_CLOCK` | `1` (optional) | Lets you move the gateway's clock forward, so you can watch daily allowances refill without waiting for midnight UTC. |
| `OPENROUTER_KEY` | your key (optional) | Real inference through OpenRouter. Without it, real model ids get a 502 and `fake/` models work as usual. |

`PORT_API` (default 3000) moves the gateway to another port if 3000 is taken. `MAX_BODY_BYTES` (default 10485760, 10 MB) is the largest request body before a 413; Claude Code's requests need well over 64 KB.

## Run it

```sh
bun dev
```

This starts two processes and opens the dashboard in your browser:

- the gateway on `http://localhost:3000`, with its logs in the terminal
- the dashboard on `http://localhost:5173` (Vite picks the next free port if 5173 is taken)

The dashboard talks to the gateway through Vite's dev proxy, which forwards exactly one request: `GET /api/admin/usage` goes to the gateway's `GET /admin/usage` with the `x-admin-key` header added from your `.env`. The admin key stays in the dev server and never reaches the browser. Every other `/api` request gets a 404 from Vite and never reaches the gateway, because any website you visit can send requests to localhost and the proxy would add the key to them. To change budgets or keys, call the gateway directly with `http/admin.http`.

Ctrl-C stops both. If either one crashes, the other is stopped too. Set `BROWSER=none` in your shell (`BROWSER=none bun dev`) to skip opening a browser tab, and run `bun run dev:api` to start the gateway on its own.

Budgets live in memory. Restarting `bun dev` puts every employee's spend back to zero, which is handy for replaying the demo.

## The demo company

The gateway loads `seed/company.json` at startup. It describes one company, Acme, with a weekly pool of $1 and five employees whose limits are tiny on purpose, so you can hit each one with a few requests:

| Employee | Key | Tier | Daily allowance | After the allowance is used |
| --- | --- | --- | --- | --- |
| Ivy | `key-intern` | intern | $0.01 | blocked until 00:00 UTC |
| Eli | `key-engineer` | engineer | $0.01 | spills to the company pool, up to $0.02 a week |
| Sam | `key-staff` | staff | $0.05 | spills to the company pool, no personal cap |
| Cal | `key-contractor` | contractor | 5% of the weekly pool ($0.05) | blocked until 00:00 UTC |
| Dee | `key-disabled` | intern | none | disabled: every request gets a 401 |

Days reset at 00:00 UTC and weeks at Monday 00:00 UTC. Once the company pool is spent, everyone is blocked until Monday.

Requests to `fake/model` are priced at $1 per million tokens. The fake answers with 1,000 input and 500 output tokens by default, so a plain request costs $0.0015. Add the header `x-fake-output-tokens: 10000` and it costs $0.011, just over a $0.01 allowance.

## Send requests

There are two ways to send requests: the ready-made files in `http/`, or curl.

### With the REST Client extension

The `http/` folder has every request, each with a comment saying what it should return. Install the VS Code [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension (the repo recommends it), open a file, and click "Send Request" above a request.

- `http/gateway.http` walks through allowed, spilled and blocked requests, then errors, streaming and real inference. Send them top to bottom.
- `http/admin.http` covers the admin API: the usage report, a tagged request and every budget control.

### With curl

These examples assume the gateway is on port 3000.

An allowed request. Sam is well under his allowance:

```sh
curl -s http://localhost:3000/v1/messages \
  -H 'x-api-key: key-staff' \
  -H 'content-type: application/json' \
  -d '{"model":"fake/model","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

You get the fake provider's reply, the same shape Anthropic's API returns:

```json
{"id":"msg_fake_1","type":"message","role":"assistant","model":"fake/model","content":[{"type":"text","text":"Fake reply."}],"stop_reason":"end_turn","usage":{"input_tokens":1000,"output_tokens":500}}
```

Hitting a limit. Run this twice as Ivy. The first request is allowed, because the check happens before the request and she still had allowance left; it costs $0.011 of her $0.01. The second is blocked:

```sh
curl -s -i http://localhost:3000/v1/messages \
  -H 'x-api-key: key-intern' \
  -H 'x-fake-output-tokens: 10000' \
  -H 'content-type: application/json' \
  -d '{"model":"fake/model","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

The blocked one is a 429 in Anthropic's error shape, so Anthropic's SDKs raise a rate-limit error with this message. The gateway's own details ride along in `error.budget`:

```json
{"type":"error","error":{"type":"rate_limit_error","message":"Daily allowance of $0.01 used. Resets 2026-11-18T00:00:00.000Z.","code":"budget_exceeded","budget":{"reason":"personal_allowance_exhausted","spentMicros":11000,"limitMicros":10000,"resetsAt":"2026-11-18T00:00:00.000Z"}},"request_id":"..."}
```

Amounts inside the gateway are integer micro-dollars: 10000 is $0.01. The response also carries `x-should-retry: false`, so SDKs don't retry a request that will be blocked again.

A streaming request. Add `"stream": true` and the gateway passes the provider's server-sent events through as they arrive, then records the cost when the stream ends:

```sh
curl -sN http://localhost:3000/v1/messages \
  -H 'x-api-key: key-staff' \
  -H 'content-type: application/json' \
  -d '{"model":"fake/model","max_tokens":64,"stream":true,"messages":[{"role":"user","content":"Hello"}]}'
```

You'll see `message_start`, the text in a `content_block_delta`, a `message_delta` with the final token counts, and `message_stop`.

A request tagged with a project. The `x-project` header labels a request for the per-project spend report. It isn't forwarded to the provider:

```sh
curl -s http://localhost:3000/v1/messages \
  -H 'x-api-key: key-staff' \
  -H 'x-project: apollo' \
  -H 'content-type: application/json' \
  -d '{"model":"fake/model","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

With `OPENROUTER_KEY` set, swap the model for `deepseek/deepseek-v4.1-flash-1017` to get a real reply, priced from OpenRouter's reported cost. Models the gateway has no price for are rejected with a 400 before anything is forwarded; the accepted list is in `src/budget/pricing.ts`.

The fake provider takes a few more test headers: `x-fake-status: 529` makes it fail, `x-fake-delay-ms` slows it down, `x-fake-drop-after: 2` cuts a stream off after two events, and `x-fake-unreachable: 1` simulates a provider that can't be reached (a 502).

## Watch the dashboard

The dashboard asks the gateway for a fresh usage report every 2 seconds, so each request you send shows up within a couple of seconds. Read it top to bottom:

- The header says "Live" and how long ago the last update arrived.
- The pool panel shows this week's spend against the $1 pool and projects where it will be by Monday.
- The ranking and the people table show who is spending, with each person's allowance used today and their pool draws. After Ivy's first request above, the table marks her "At limit".
- "Needs attention" lists people at their limit or blocked this week, with the reason. Ivy's blocked request puts her there.
- The projects panel shows spend by `x-project` tag, with untagged requests as "(no project)".

If you stop `bun dev`, the open tab's header turns amber, "Stale since ...", and keeps the last numbers on screen. Start it again and the tab goes back to "Live" within a couple of seconds, with spend back at zero.

## Change budgets with the admin API

Every admin request needs the `x-admin-key` header. Changes apply from the next gateway request, and amounts you send are in dollars.

| What | Request | Body |
| --- | --- | --- |
| Usage report (what the dashboard reads) | `GET /admin/usage` | none |
| Set the weekly pool | `PUT /admin/company/pool` | `{"weeklyPoolUsd": 2}` |
| Move an employee to another tier | `PUT /admin/employees/{id}/tier` | `{"tierId": "engineer"}` |
| Override an employee's limits | `PUT /admin/employees/{id}/overrides` | `{"dailyAllowanceUsd": 1, "poolCapUsd": null}` |
| Revoke an employee's key | `DELETE /admin/employees/{id}/key` | none |
| Issue a new key (and re-enable them) | `POST /admin/employees/{id}/key` | none |
| Move the clock forward (needs `DEMO_CLOCK=1`) | `POST /admin/clock/advance` | `{"hours": 24}` |

Employee ids are the lowercase names: `ivy`, `eli`, `sam`, `cal`, `dee`. An override replaces the employee's whole override set, so sending `{}` clears it, and `"poolCapUsd": null` means no cap.

For example, double the pool. Cal's allowance is 5% of the pool, so it goes from $0.05 to $0.10 a day without touching his tier:

```sh
curl -s -X PUT http://localhost:3000/admin/company/pool \
  -H 'x-admin-key: dev-admin-key' \
  -H 'content-type: application/json' \
  -d '{"weeklyPoolUsd": 2}'
```

```json
{"id":"acme","name":"Acme","weeklyPoolMicros":2000000}
```

Or skip a day, so every daily allowance refills (pool draws carry over until Monday):

```sh
curl -s -X POST http://localhost:3000/admin/clock/advance \
  -H 'x-admin-key: dev-admin-key' \
  -H 'content-type: application/json' \
  -d '{"hours": 24}'
```

The gateway also serves a plain HTML version of the usage report at `http://localhost:3000/admin`, which asks for the admin key, and the OpenAPI document for every route at `http://localhost:3000/openapi.json`.

## Point Claude Code at the gateway

Claude Code speaks the Anthropic Messages API, so it can run through the gateway and be budgeted like any other client. Start it with these environment variables (it needs `OPENROUTER_KEY` set on the gateway for real replies):

```sh
ANTHROPIC_BASE_URL=http://localhost:3000 \
ANTHROPIC_API_KEY=key-staff \
ANTHROPIC_MODEL=deepseek/deepseek-v4.1-flash-1017 \
ANTHROPIC_SMALL_FAST_MODEL=deepseek/deepseek-v4.1-flash-1017 \
claude
```

`ANTHROPIC_API_KEY` is the employee's gateway key, which Claude Code sends as `x-api-key`. The two model variables matter because the gateway only accepts the OpenRouter model ids in its price table, and Claude Code would otherwise ask for its default Claude models by their Anthropic names. Newer Claude Code versions name the small model `ANTHROPIC_DEFAULT_HAIKU_MODEL`; setting both is harmless.

Claude Code's requests appear on the dashboard under Sam. The gateway doesn't implement `/v1/messages/count_tokens`, so that one call gets a 404; Claude Code's normal requests aren't affected.

## When something goes wrong

| You see | Cause and fix |
| --- | --- |
| `dev: Port 3000 is already in use, so the gateway can't start. Nothing was started.` | Another process holds the gateway's port, often an earlier `bun dev` that didn't exit. Find it with `lsof -i :3000` and stop it, or set `PORT_API` in `.env` to a free port. `bun dev` checks this first, so the dashboard never ends up talking to the wrong server. |
| The dashboard says "The gateway rejected the admin key" | `ADMIN_KEY` is missing from `.env` or shorter than 8 characters. Set it and restart `bun dev`. |
| The dashboard says "Can't reach the gateway" | The gateway isn't running or crashed at startup. Its error is in the terminal. |
| The gateway exits with "Invalid configuration" | A variable in `.env` has a bad value. The message names it. |
| A real model returns 502 `upstream_unavailable` | `OPENROUTER_KEY` isn't set, or OpenRouter couldn't be reached. Use a `fake/` model, or set the key. |

## Run the checks

```sh
bun run check
```

This is the gate: lint, typecheck, tests and the build for the gateway, then lint, typecheck and tests for the dashboard. It takes a few seconds and needs no `.env` and no network; OpenRouter is stubbed in tests.

The dashboard's browser tests run separately, against a production build:

```sh
cd web && bun run e2e
```

Run one test file with `bun run test src/budget/decide.test.ts`. `AGENTS.md` lists every command.

## How the code is organized

```
src/          the gateway (Hono on Node)
  gateway/    POST /v1/messages: key check, budget decision, forward, record
  budget/     the budget rules, pure functions with no I/O
  upstream/   OpenRouter and the fake provider
  admin/      the admin API
  store/      the in-memory store, behind an interface a database could replace
web/          the dashboard (React on Vite)
seed/         the demo company
http/         requests for the REST Client extension
scripts/      bun dev
tests/        HTTP and process-level tests (unit tests sit beside each module)
```

Start reading at `src/README.md`, which maps every folder and follows one request through the code. The dashboard has its own guide in `web/README.md`.

## Plans and background

- `problem-statement.md`: the product brief.
- `plans/spend-gateway/`: the build plan. `README.md` has the phase status, and `spec.md` the budget rules, error model and contracts.
- `plans/dashboard/plan.md`: what the dashboard shows and why.
- `AGENTS.md`: conventions and commands for anyone (or any coding agent) changing the code.
