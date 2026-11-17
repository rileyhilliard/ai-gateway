# Admin API

Everything here sits behind one admin key: `ADMIN_KEY` from the environment, sent as `x-admin-key` ([auth.ts](auth.ts)). With no key configured, every admin request is a 401.

- [usage-route.ts](usage-route.ts): `GET /admin/usage`, the usage report as JSON (what the dashboard in `web/` polls), and `GET /admin`, a static HTML page ([usage-page.ts](usage-page.ts)) that asks for the key and renders the same report.
- [budget-routes.ts](budget-routes.ts): set the weekly pool, move an employee to another tier, set or clear their overrides, revoke or reissue their key. Inputs are dollars; responses are micro-dollars.
- [clock-route.ts](clock-route.ts): `POST /admin/clock/advance`, mounted only when `DEMO_CLOCK=1`, to skip a demo past a daily or weekly reset.

Changes apply from the next gateway request. The report itself is built in `../reports/usage.ts`.
