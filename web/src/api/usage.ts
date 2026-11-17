/**
 * Defines the gateway's usage report schema and the polling query the dashboard reads. The
 * schema mirrors `UsageReport` in the gateway's OpenAPI document (`GET /admin/usage`).
 */

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { ApiClient } from "./client";

/** How often the dashboard asks the gateway for a fresh report. */
export const USAGE_POLL_MS = 2_000;

const micros = z.number().int();

const OverflowPolicy = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("block") }),
  z.object({ kind: z.literal("pool"), weeklyCapMicros: micros.nullable() }),
]);

export const EmployeeUsage = z.object({
  employeeId: z.string(),
  name: z.string(),
  tierId: z.string(),
  disabled: z.boolean(),
  spentTodayMicros: micros,
  dailyAllowanceMicros: micros,
  overflow: OverflowPolicy,
  poolDrawsThisWeekMicros: micros,
  spentThisWeekMicros: micros,
  blockedThisWeek: z.number().int(),
});
export type EmployeeUsage = z.infer<typeof EmployeeUsage>;

export const ProjectUsage = z.object({
  projectTag: z.string().nullable(),
  spentThisWeekMicros: micros,
  requests: z.number().int(),
  blockedRequests: z.number().int(),
});
export type ProjectUsage = z.infer<typeof ProjectUsage>;

export const UsageReport = z.object({
  asOf: z.iso.datetime(),
  dayResetsAt: z.iso.datetime(),
  weekResetsAt: z.iso.datetime(),
  company: z.object({
    id: z.string(),
    name: z.string(),
    spentThisWeekMicros: micros,
    weeklyPoolMicros: micros,
  }),
  employees: z.array(EmployeeUsage),
  projects: z.array(ProjectUsage),
});
export type UsageReport = z.infer<typeof UsageReport>;

/**
 * GET {apiUrl}/admin/usage, polled. No retries: the next poll is the retry, and failing at once
 * lets the page mark its data stale without waiting out a backoff.
 */
export const usageQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: ["usage"],
    queryFn: ({ signal }) => api.get("/admin/usage", UsageReport, { signal }),
    refetchInterval: USAGE_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
