# Phase 7: project tags and spend by project

Status: lane a (opus) running from seam `727bece`.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Depends on: phase 2. The gateway half landed in the seam: `x-project` (trimmed, blank is none, over 64 characters is a 400) is stored as `UsageRecord.projectTag` and isn't forwarded.

## Behavior

- `GET /admin/usage` gains `projects`: one row per project tag seen in this week's records (the same week the report already uses), with `projectTag` (`null` for untagged), `spentThisWeekMicros` (allowed records only), `requests` (allowed) and `blockedRequests`. Sorted by spend, highest first, then by tag with `null` last. A week with no records gives `[]`.
- The `/admin` page shows the same table under the employee table, with "(no project)" for `null`, dollars formatted like the existing cells, written with `textContent` like the rest of the page.
- The OpenAPI schema for the usage report includes the new field.

## Lane a (opus)

Owns: `src/reports/usage.ts` and its test, `src/admin/usage-route.ts`, `tests/admin-http.test.ts`, `http/admin.http`. Reuse the period helpers in `src/budget/spend.ts` (read-only for you) rather than a new date filter.

Tests first, then code. Cases, by name:
- sums this week's allowed spend per project, with untagged spend under null
- counts blocked requests per project without adding to spend
- leaves out records from before this week
- sorts projects by spend, highest first, with untagged last on ties
- returns an empty list for a week with no usage
- GET /admin/usage reports spend per project from tagged gateway requests (HTTP, through the real gateway with `x-project`)
- the /admin page has a projects table (assert the markup carries it, like the existing page test)

Add a short tagged-request example to `http/admin.http` (or note in its comments that `x-project` goes on gateway requests).

Gate: `bun run check` (about 5 s) before reporting. Commit as `phase 7 lane a: spend by project in the usage view`.
