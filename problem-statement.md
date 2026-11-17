# PRD: Enterprise AI Spend Gateway

> Status: REVIEW (devils-advocate findings applied)
> Date: 2026-11-17

## TL;DR

A gateway that companies put between their employees and AI providers (Anthropic, OpenAI). The company sets a weekly dollar pool, places employees in spend tiers, and the gateway allows, spills over, or blocks each request according to that employee's tier. Admins see spend per employee. Think OpenRouter, but the buyer is the company and the core feature is budget control, not model routing.

## Problem

### Who

The admin is whoever owns the company's AI bill: an engineering manager, IT, or finance. They are accountable for spend but have no per-person control or visibility today.

The employee is anyone using AI at work, developers and non-developers alike. Many developers already have a subscription plan (for example Claude Max) and only need API spend once that plan is rate-limited.

### What

Companies adopting AI struggle to give employees access to paid API usage without either handing out uncapped keys or rationing access by hand. The result is surprise bills, or employees blocked from work that the company would happily have paid for.

Vendor consoles offer spend limits per workspace or project, but not per person with role-based tiers, a shared pool to fall back on, and one view across providers.

### Evidence

This is a product hypothesis from the founding notes. No customer interviews yet. Comparable tools (below) shipping per-key budgets suggests the need is real; whether companies want tiered pool spillover specifically is unvalidated.

## Decisions made during planning

| Topic | Decision |
| --- | --- |
| Enforcement | Gateway in the request path. Employees get a per-person virtual key; tools point at our endpoint. Hard limits require this. |
| Subscription plans | Outside the system. We only see and meter traffic that reaches the gateway, which is the overflow after a plan is exhausted (and any non-plan API use). |
| Budget unit | US dollars, stored as integer micro-dollars so sums and boundary comparisons are exact. Each model has separate input and output prices per million tokens. Tokens are still recorded and shown. |
| Wire format | Anthropic Messages API (`POST /v1/messages`, key in `x-api-key`), passed through unchanged, so Claude Code works by changing its base URL and key. OpenAI-compatible endpoint deferred. |
| Inference provider | OpenRouter, through its Anthropic Messages endpoint, with one company OpenRouter key held server-side. When OpenRouter reports a request's cost, that cost is recorded; otherwise the price table is used. |
| Limits | Spend tiers. Each employee is in exactly one tier, with optional per-employee overrides. |
| Reset periods | Fixed: personal allowance resets daily at 00:00 UTC; company pool resets weekly, Monday 00:00 UTC. |
| Cost overrun | Budget is checked before forwarding, actual cost recorded after. The last allowed request may overshoot; the next one is blocked. |
| Oversubscription | Allowed. Sum of allowances may exceed the pool. The pool is a hard ceiling for everyone. |
| ROI / projects | Deferred, but the usage record carries an optional project field from day one. |
| Percent-of-pool limits | Deferred to a later phase. Dollars only in v1. |
| Coding vs prototyping budgets | Dropped for now; distant later phase. |

## Solution

### Jobs to be done

When I roll out AI to the company, I want to give each group of people a spending allowance that fits their role, so I can say yes to usage without risking an unbounded bill.

When my plan or allowance runs out mid-task, I want to keep working if my company allows it, and get a clear reason if it doesn't, so I'm not guessing why my tool stopped.

### Concepts

A company has one pool: a dollar amount per week. All gateway spend by its employees counts against the pool, whether it was drawn from a personal allowance or not.

A tier defines a daily personal allowance in dollars and an overflow policy for when that allowance is used up. The overflow policy is one of: block; draw from the pool up to a weekly cap of $X per employee; or draw from the pool without a personal cap.

An employee belongs to one tier and may override the tier's allowance and pool cap. Overrides replace those numbers only; they never change the tier's overflow policy, so a pool-cap override on a block tier has no effect. An override can set the pool cap to "uncapped", which is distinct from having no override. Overrides persist when the employee moves tiers. Each employee has one active virtual API key; issuing a new one revokes the old one.

A usage record is written for every request that passes the key check (rule 1): employee, model, status (allowed or blocked, with the block reason), input and output tokens, cost, which bucket paid (personal or pool, empty when blocked), the request's start timestamp, and an optional project tag. Blocked requests have zero cost and feed the blocked-request count in the usage view.

### Budget decision rules

These rules are the heart of the product and every one gets a test. They use three sums over allowed usage records:

| Sum | Definition |
| --- | --- |
| Company spend this week | All costs for the company in the current week, either bucket |
| Employee personal spend today | That employee's costs with bucket = personal in the current day |
| Employee pool draws this week | That employee's costs with bucket = pool in the current week |

A day is [00:00 UTC, next 00:00 UTC) and a week is [Monday 00:00 UTC, next Monday 00:00 UTC). A request starting exactly on a boundary belongs to the new period.

1. Unknown, revoked, or disabled key: reject with 401. Nothing recorded. A malformed body (bad JSON, no `model`) is checked after this and rejected with 400.
2. Model with no price in the price table: reject with 400. We never forward a request we can't cost.
3. Company spend this week is at or above the pool: reject with 429, reason "company pool exhausted". This applies even if the employee has personal allowance left.
4. Employee's spend charged to personal today is below their allowance: allow, charge personal.
5. Otherwise, if the overflow policy permits and the employee's pool draws this week are below their pool cap (or uncapped): allow, charge pool.
6. Otherwise reject with 429, reason "personal allowance exhausted" (block policy) or "pool cap reached".

Cost is attributed to the bucket chosen at decision time, in full, even if the actual cost exceeds what was left in that bucket. Periods are assigned by the request's start time, so a request that finishes after midnight UTC counts toward the day it started.

A 429 response includes the reason, the amount spent, the limit, and `resets_at`, the earliest time the employee could next be allowed:

| Reason | `resets_at` |
| --- | --- |
| Company pool exhausted | Next Monday 00:00 UTC |
| Personal allowance exhausted (block policy) | Next 00:00 UTC |
| Pool cap reached, allowance above $0 | Next 00:00 UTC, when the allowance refills |
| Pool cap reached, allowance of $0 | Next Monday 00:00 UTC |

### Edge cases

| Case | Behavior |
| --- | --- |
| Several requests in flight when an employee nears their limit | Each passes the check independently. Each one can overshoot by up to its `max_tokens` times the output price, and v1 does not limit concurrency, so in practice the overshoot is unbounded. Accepted for v1. |
| Upstream provider errors | Charge for token usage if the provider reports it; otherwise no charge. The provider's error is passed through. This leaks spend if the provider billed a request that timed out or dropped. |
| Personal-only spend reaches the pool | Next request from anyone is rejected by rule 3, even employees with allowance left. |
| Request starts Sunday 23:59:59 UTC, next one Monday 00:00:00 | First counts toward the old week and day, second toward the new ones. |
| Admin sets a negative pool, allowance, or cap | Rejected by the admin API with 400. Zero is valid. |
| Admin lowers an allowance below what's already spent today | Takes effect on the next request, which is blocked or spills to the pool. Past spend is unchanged. |
| Admin moves an employee to another tier mid-period | New tier applies to the next request. Spend so far in the period still counts. |
| Admin lowers the pool below this week's spend | Every employee in the company is blocked until the weekly reset or the pool is raised. |
| Employee removed or key revoked | Immediately rejected (rule 1). Usage history is kept for reporting. |
| Price table changes | Applies to new requests only. Recorded costs never change. |
| Allowance of $0 | Valid: every request goes straight to the overflow policy. Useful for "pool only" tiers. |
| Override sets a capped tier's pool cap to uncapped, or the reverse | Override wins. |
| Pool-cap override on a block-policy tier | No effect; the employee is still blocked at their allowance. |
| Employee with overrides moves tiers | Overrides carry over to the new tier. |

### Admin experience (v1)

v1 has one company, with its pool, tiers, employees, and keys seeded from a config file. The admin API covers only what the edge cases need: set the pool, change an employee's tier or overrides, revoke or reissue a key, and read usage. A usage view lists every employee with today's personal spend against their allowance, this week's pool draws against their cap, and number of blocked requests, plus company spend against the pool. It's served as JSON with a minimal page or CLI on top; polish comes later.

### Employee experience (v1)

The employee sets their tool's base URL and API key to the gateway's. Requests either succeed exactly as they would against the provider, or fail with a 429 that says which limit was hit and when it resets.

## Research

| Product | Approach | Gap for our buyer |
| --- | --- | --- |
| OpenRouter | One key, many models, credit balance per account | Built for individuals; no org hierarchy or per-employee policy |
| LiteLLM proxy | Self-hosted gateway with virtual keys and budgets per key, user, and team | Budgets are flat caps; no tiered spillover into a shared pool; operator-heavy |
| Anthropic Console / OpenAI projects | Spend limits per workspace or project | Per-project, single vendor, not per person |

Users who know LiteLLM or OpenRouter will expect virtual keys, which we match. They'll also expect an OpenAI-compatible endpoint; we start with the Anthropic format because the first target client is Claude Code. The tiered pool spillover is where we differ. This table is from existing knowledge and was not re-researched for this draft.

## Scope

### Must have (v1, the core loop)

- One seeded company with a weekly pool, tiers, employees with overrides, and virtual keys
- In-memory storage behind a small store interface, so a database can replace it later
- The decision function as pure code, `(config, usage records, now) -> decision`, with a direct test per rule and per edge case
- A gateway endpoint that authenticates the key, decides, forwards, and records usage, with a few integration tests
- An injectable clock, so reset behavior is testable and demoable
- A fake upstream provider whose token usage, latency, and errors (with or without usage) are controlled by the request, so the demo and tests run without vendor keys or real spend
- A per-model price table
- The trimmed admin API and usage view described above

### Later phases, in order (each a self-contained chunk if time allows)

1. Anthropic-shaped error bodies, so SDK clients see typed errors. (Real inference through OpenRouter moved into v1.)
2. Streaming responses, recording usage from the final stream event, so Claude Code works through the gateway.
3. Percent-of-pool allowances, resolved at check time so they track pool changes.
4. Project tag header and spend-by-project report (the field already exists).
5. Configurable reset periods and company time zones.
6. Coding vs prototyping usage categories (distant).

### Won't have (this version)

- Multiple companies, sign-up, and company management: v1 is one seeded company.
- Metering subscription plan usage: vendors don't expose it per token.
- Automatic fallback from plan to gateway: that is client configuration, not something we control.
- SSO, user accounts for employees, or an employee-facing dashboard.
- Billing, invoicing, or charging companies money.
- Model routing, fallbacks between providers, or caching.
- Reservations to prevent concurrent overshoot.

## Success criteria

For the v1 build: the demo shows an employee's requests succeeding, spilling to the pool, and being blocked according to their tier, with the usage view matching; and the test suite covers every decision rule and edge case listed above.

For the product: companies exceed their weekly pool only by in-flight overshoot, and blocked requests are rare enough that admins don't routinely raise limits by hand (target and measurement to be set once there are customers).

## Assumptions and risks

| Assumption | Confidence | How to validate |
| --- | --- | --- |
| Companies want tiered spillover into a shared pool, not just flat caps | Low | Customer interviews before building beyond v1 |
| Developer tools can be pointed at a custom base URL and key | High for Claude Code and most SDKs | Configure Claude Code against the gateway in the real-provider phase |
| Tools fall back from a subscription plan to an API key when the plan is exhausted | Low; may require manual switching | Test with Claude Code; if manual, document it as a known friction |
| Dollar budgets are easier for admins than token budgets | Medium | Ask admins during interviews |
| Overshoot is acceptable to buyers, given each request can exceed by up to `max_tokens` times the output price and concurrency is unlimited | Medium | Reservations or a concurrency limit per employee are later options if not |
| Fixed UTC resets are acceptable | Medium | Non-US customers will likely ask for local time; it's phase 5 |
