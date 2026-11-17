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

Only the pool hero sits on a panel. The other sections sit on the canvas under a sentence-case heading, separated by space and hairlines.

1. Header. "Acme Corp / AI spend", then "Week of 16–22 Nov · resets Mon 00:00 UTC, in 2d 3h", and a live indicator: a green dot with "Live, updated 2 s ago", or amber "Stale since 14:02:10 UTC" after a failed poll. A 1 px brand gradient rule sits under the header.
2. Pool hero. Spent as one large sans figure (tabular), "of $1.00" and the percent used. To the right, the pace status: a colored dot and a short title ("On pace" in success green, "Over pace" in waiting amber, "Pool spent" in error red, "Too early to project" muted) over one plain line ("projected $X by Monday, Y% of the pool"; for a spent pool, "every request is blocked until Mon 00:00 UTC"). The bar shows spend lit, the projection dimly lit from spend to where it's heading (capped at the bar's end, which is the pool), a tick at today labelled "Today, 37% of the week", "Projected $X" (or "Heading for $X" past the pool) above, and "$1.00 pool" at the end. Under a hairline: pool left, active people (`spentThisWeek > 0`) out of the total, and blocked requests this week.
3. People, which is also the cost ranking. Sorted by cost, highest first. Columns: name, tier (muted), cost this week with an inline share bar and its percent of this week's spend, today's allowance as a bar and "x / y", pool draws against the cap ("uncapped"; block tiers get a quiet dash labelled "Blocks after allowance" for screen readers), blocked this week, and a status of a dot and text ("At limit", "Disabled" or nothing). Numbers are right-aligned mono with tabular figures. On a phone the table scrolls inside its own box with the name column pinned. When nobody has spent anything, a line above it says "Nobody has spent anything this week."
4. Needs attention, beside Projects on wide screens. One line per person at their limit now or blocked this week: name, a short reason ("Daily allowance used, blocked until 00:00 UTC", "Pool cap reached", "Company pool ran out", "Ran past their $0.0100 daily allowance"), and "3 blocked". Empty, it's one quiet line: "Nobody is blocked this week."
5. Spend by project. One row per project: name, request and blocked counts, the spend, and a share bar under it, with "(no project)" for untagged. The empty state reads: "No tagged requests this week. Send x-project on gateway requests to see spend by project."

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
- Fonts: Instrument Sans Variable for every word, headings included, and Martian Mono Variable (slightly condensed, tabular) for figures in the table and lists, via `@fontsource-variable/*`. The hero figure and its stat line are sans with tabular figures: mono at 52 px shouts.
- Radii: 4 px controls, 6 px panels. 1 px line borders. Focus ring: 2 px info outline.
- Usage bars take one color for the whole bar from the monitor's thresholds (cyan under 60%, purple from 60% to 85%, pink above), drawn as an SVG dot grid like `Dots.tsx`, not the brand gradient. Share bars (cost share, project share) are neutral ink-2: a share isn't good or bad. The brand gradient (`linear-gradient(90deg,#ff2e97,#bf40ff 35%,#00ffff 70%,#39ff14)`) is decoration only.
- Plain CSS with tokens as custom properties (the stack's default: one stylesheet). No chart library: the bars are small SVGs.

## Dev experience

`bun dev` at the repo root starts the API (the old command becomes `dev:api`) and the Vite dev server together, and opens the dashboard in the browser. Ctrl-C stops both. The Vite dev proxy forwards `/api/*` to `http://localhost:${PORT_API:-3000}` and adds `x-admin-key` from the root `.env`'s `ADMIN_KEY`, read with Vite's `loadEnv` inside the proxy config. The key lives server-side in the dev server, never in a `VITE_` variable, so it isn't in the bundle. `bun run check` at the root also runs web's lint, typecheck and unit tests (not e2e).

## Out of scope for v1

Spend over time (the API has no time series), drill-down per employee, editing budgets from the dashboard (admin.http and the API cover that), auth beyond the dev proxy, and a production deploy.
