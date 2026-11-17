/**
 * The dashboard's header: the company and product, the week's dates and when the pool resets, and
 * the live indicator, over a thin brand gradient rule.
 */

import type { UsageReport } from "../../api/usage";
import { LiveIndicator } from "./live-indicator";
import { formatCountdown, formatResetTime, formatWeekRange } from "./time";

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
        <div className="title-block">
          <div className="title-line">
            <h1>{report.company.name}</h1>
            <span className="product-name">AI spend</span>
          </div>
          <p className="week-line">
            {`Week of ${formatWeekRange(report.weekResetsAt)} · resets ${formatResetTime(report.weekResetsAt)}, in ${formatCountdown(report.asOf, report.weekResetsAt)}`}
          </p>
        </div>
        <LiveIndicator updatedAt={props.updatedAt} isStale={props.isStale} />
      </div>
      <div aria-hidden="true" className="brand-rule" />
    </header>
  );
}
