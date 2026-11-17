# Spend dashboard

One page for the executive who owns the AI budget, read top to bottom: is the weekly pool on track, who drives the spend, who is hitting their limits, and where the money goes by project. The plan is [plans/dashboard/plan.md](../../../../plans/dashboard/plan.md).

Start with [dashboard-page.tsx](dashboard-page.tsx). It polls the usage query from `../../api/usage.ts` every 2 seconds and owns the loading, error and stale states; every panel below it only renders a report.

The rules live in pure modules with their own tests:

- [pace.ts](pace.ts): how much of the week has gone and the projected spend by Monday.
- [people.ts](people.ts): allowance used, at-limit, cost order and who needs attention.
- [money.ts](money.ts) and [time.ts](time.ts): micro-dollars, percents and UTC times as text.

The panels, in page order: [dashboard-header.tsx](dashboard-header.tsx) (with [live-indicator.tsx](live-indicator.tsx)), [pool-panel.tsx](pool-panel.tsx) (the hero, with the pace status and the week's supporting numbers), [people-table.tsx](people-table.tsx) (also the cost ranking), [needs-attention.tsx](needs-attention.tsx) and [project-spend.tsx](project-spend.tsx). [dot-bar.tsx](dot-bar.tsx) draws every bar as SVG dots, like rr's monitor.

[dashboard-page.test.tsx](dashboard-page.test.tsx) renders the real route against MSW and reads the page the way the executive does.
