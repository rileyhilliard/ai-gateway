/**
 * The executive spend dashboard: one page, read top to bottom, polling the gateway's usage
 * report. It owns the loading, error and stale states; each panel below only renders a report.
 */

import { useQuery } from "@tanstack/react-query";
import type { UsageReport } from "../../api/usage";
import { usageQuery } from "../../api/usage";
import { useServices } from "../../app/services";
import { ErrorState } from "../../components/error-state";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { KpiStrip } from "./kpi-strip";
import { NeedsAttention } from "./needs-attention";
import { PeopleTable } from "./people-table";
import { PoolPanel } from "./pool-panel";
import { ProjectSpend } from "./project-spend";
import { SpendRanking } from "./spend-ranking";

/** The dashboard route at "/". */
export function DashboardPage() {
  const { api } = useServices();
  const usage = useQuery(usageQuery(api));

  if (usage.isPending) return <DashboardSkeleton />;
  // TanStack Query keeps the last good report when a later poll fails, so data and an error
  // can both be present: that is the stale state, not the error page.
  if (usage.data === undefined) {
    return <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />;
  }
  return (
    <>
      <DashboardHeader
        report={usage.data}
        updatedAt={usage.dataUpdatedAt}
        isStale={usage.isError}
      />
      {usage.isError && <ErrorState error={usage.error} />}
      <DashboardPanels report={usage.data} />
    </>
  );
}

function DashboardPanels(props: { report: UsageReport }) {
  const { report } = props;
  const noUsageYet = report.projects.length === 0;
  return (
    <div className="dashboard-panels">
      {noUsageYet && <p className="hint">Send a request from http/gateway.http to see it here.</p>}
      <PoolPanel report={report} />
      <KpiStrip report={report} />
      <div className="panel-pair">
        <SpendRanking report={report} />
        <NeedsAttention employees={report.employees} />
      </div>
      <PeopleTable employees={report.employees} />
      <ProjectSpend projects={report.projects} />
    </div>
  );
}
