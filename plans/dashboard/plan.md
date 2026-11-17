# Executive spend dashboard

Status: lane a (opus) running from `HEAD` after the web scaffold. Product thinking via `ce:planning-products`.

## Who and why

The reader is the executive who owns the company's AI budget (a CFO, CTO or eng VP). They open it a few times a week, and during a demo they watch it while someone sends requests. They want four answers, in this order:

1. Are we on track for this week's pool, or will we run out before Monday?
2. Who is driving the spend, and how concentrated is it?
3. Who is hitting their limits? Blocks are friction, and a person blocked every day probably needs a bigger tier.
4. Where is the money going by project?

Hypothesis: an executive acts on pace and concentration, not raw totals. So the pool panel leads with a projection against the week's elapsed time, and the people view ranks people by what they cost rather than listing them alphabetically.

Experience qualities: transparent (live, with visible freshness) and obvious (no instructions, plain words, every number labelled). Tradeoff: no drill-downs, filters or settings in v1. It's one page you read top to bottom.

## Data

There's one source: `GET /admin/usage` on the gateway (the live store), polled every 2 s with TanStack Query's `refetchInterval`, plus a refetch on window focus. That's enough to feel live in a demo. A push stream (SSE) is the follow-up if polling ever costs too much.

Fields used:
- `company`: `name`, `spentThisWeekMicros`, `weeklyPoolMicros`.
- `asOf`, `weekResetsAt`, `dayResetsAt`.
- `employees[]`: `employeeId`, `name`, `tierId`, `disabled`, `spentTodayMicros`, `dailyAllowanceMicros`, `overflow` (`{kind:"block"}` or `{kind:"pool", weeklyCapMicros: number|null}`), `poolDrawsThisWeekMicros`, `spentThisWeekMicros`, `blockedThisWeek`.
- `projects[]`: `projectTag` (`null` is untagged), `spentThisWeekMicros`, `requests`, `blockedRequests`.

The OpenAPI document is at `/openapi.json` (schema `UsageReport`). Validate the response with zod at the client boundary, as the scaffold's client already does.

Derived on the client:
- Week elapsed fraction: `(asOf - (weekResetsAt - 7d)) / 7d`.
- Projected week spend: `spent / elapsedFraction`. Guard the first minutes of the week by showing "too early to project" while the elapsed fraction is under 2%.
- Allowance used today: `spentToday / dailyAllowance`. A $0 allowance is shown as "pool only", not as a division.
- At limit: on a block tier with `spentToday >= dailyAllowance` (blocked until tomorrow), or on a capped pool tier with `poolDraws >= cap` and the allowance used.

## Page, top to bottom

1. Header. The company name, "Week resets Mon 00:00 UTC (in 2d 3h)", and a live indicator: a green dot with "Live, updated 2 s ago", amber "Stale since 14:02:10" after a failed poll, or red on an error. A brand gradient rule sits under the header.
2. Pool panel. Spent and pool as large mono numbers, the percent used, and a bar of spend with a pace marker at the elapsed fraction of the week. Under the bar, a status line: "On pace: projected $X by Monday (Y% of pool)" in success green, or "Over pace: projected $X, Y% of the pool" in waiting amber, or error red when the pool is already spent.
3. KPI strip, four tiles: spent this week; pool remaining; active people this week (`spentThisWeek > 0`) out of the total; blocked requests this week (the sum).
4. Who's using the budget. Ranked horizontal bars of people by cost this week, each labelled with dollars and their share of this week's spend. Show the top 8 and fold the rest into "N others".
5. People table. Name, tier, cost this week, a bar for allowance used today (with "x / y"), pool draws against the cap ("uncapped", or "blocks after allowance" on block tiers), blocked this week, and a status chip ("At limit", "Disabled" or nothing). Sorted by cost, highest first.
6. Needs attention. People at their limit now, and people with blocked requests this week, each with the plain reason ("Blocked 3 times this week; their daily allowance is $0.01"). An empty state reads "Nobody is blocked this week."
7. Projects. Ranked bars of spend by project, with "(no project)" for untagged and the request and blocked counts. The empty state reads: "No tagged requests this week. Send x-project on gateway requests to see spend by project."

Money: micros become dollars. Show two decimals at $1 and up ($1,234.56). Below $1, show four decimals ($0.0110), since the demo amounts are fractions of a cent.

## States

- Loading (first fetch): skeleton panels.
- 401: "The gateway rejected the admin key. Set ADMIN_KEY (8+ characters) in the repo's .env and restart bun dev."
- Unreachable: "Can't reach the gateway at localhost:3000. Is bun dev running?" Keep the last good data on screen and mark it stale.
- Any other error: the status and the request id.
- No usage yet this week: zeros, the empty states above, and the hint "Send a request from http/gateway.http to see it here."

## Design: emulate the rr site (`~/Projects/rr/site`)

Read these, read-only: `src/styles/global.css` (the `@theme` tokens), `src/components/landing/monitor/MonitorCard.tsx` and `Dots.tsx` (panels and usage bars), and `docs/PRODUCT.md` ("Changes made while building", on bars and colors).

- Dark only, with `color-scheme: dark`. Canvas `#0a0a0f`, panel `#12121a`, line `#2a2a4a`, line-strong `#6a6a9a`. Ink `#ffffff`, ink-2 `#b4b4d0`, muted `#8a8aae`, and faint (decoration only).
- Meaning colors: accent `#ff2e97`, info `#00ffff`, success `#39ff14`, waiting `#ffaa00`, error `#ff0055`, sync `#bf40ff`. Text on a neon fill is canvas-colored, never white.
- Fonts: Instrument Sans Variable for prose and Martian Mono Variable for numbers, labels and chips, via `@fontsource-variable/*`.
- Radii: 2 px chips, 4 px controls, 6 px panels. 1 px line borders. Focus ring: 2 px info outline.
- Usage bars use the monitor's threshold colors (cyan under 60%, purple from 60% to 85%, pink above), drawn as an SVG dot grid like `Dots.tsx`, not the brand gradient. The brand gradient (`linear-gradient(90deg,#ff2e97,#bf40ff 35%,#00ffff 70%,#39ff14)`) is decoration only.
- Plain CSS with tokens as custom properties (the stack's default: one stylesheet). No chart library: the bars are small SVGs.

## Dev experience

`bun dev` at the repo root starts the API (the old command becomes `dev:api`) and the Vite dev server together, and opens the dashboard in the browser. Ctrl-C stops both. The Vite dev proxy forwards `/api/*` to `http://localhost:${PORT_API:-3000}` and adds `x-admin-key` from the root `.env`'s `ADMIN_KEY`, read with Vite's `loadEnv` inside the proxy config. The key lives server-side in the dev server, never in a `VITE_` variable, so it isn't in the bundle. `bun run check` at the root also runs web's lint, typecheck and unit tests (not e2e).

## Out of scope for v1

Spend over time (the API has no time series), drill-down per employee, editing budgets from the dashboard (admin.http and the API cover that), auth beyond the dev proxy, and a production deploy.
