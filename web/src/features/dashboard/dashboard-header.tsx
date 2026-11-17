/**
 * The dashboard's header: the company, when the weekly pool resets, and the live indicator,
 * over the brand gradient rule.
 */

import type { UsageReport } from "../../api/usage";
import { LiveIndicator } from "./live-indicator";
import { formatCountdown, formatResetTime } from "./time";

/** The page header for one report. */
export function DashboardHeader(props: {
  report: UsageReport;
  updatedAt: number;
  isStale: boolean;
}) {
  const { report } = props;
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-row">
        <div>
          <h1>{report.company.name}</h1>
          <p className="muted">
            {`Week resets ${formatResetTime(report.weekResetsAt)} (in ${formatCountdown(report.asOf, report.weekResetsAt)})`}
          </p>
        </div>
        <LiveIndicator updatedAt={props.updatedAt} isStale={props.isStale} />
      </div>
      <div aria-hidden="true" className="brand-rule" />
    </header>
  );
}
