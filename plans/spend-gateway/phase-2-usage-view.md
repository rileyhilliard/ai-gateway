# Phase 2: admins see spend per employee

Status: planned.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: after the phase 1 requests, send the requests in `http/admin.http` (`GET /admin/usage` with `x-admin-key`) and open `localhost:3000/admin` to see each employee's spend today against allowance, pool draws against cap, blocked count, and company spend against the pool.
Depends on: phase 1.

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| inline | M | `src/reports/usage.ts` (pure report rows), `src/admin/auth.ts`, `src/admin/usage-route.ts` (JSON plus a minimal HTML page), `http/admin.http` | me |
