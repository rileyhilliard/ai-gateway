/**
 * Four headline numbers for the week: spend, pool left, how many people are active and how many
 * requests were blocked.
 */

import type { UsageReport } from "../../api/usage";
import { formatMoney } from "./money";

/** The KPI tiles under the pool panel. */
export function KpiStrip(props: { report: UsageReport }) {
  const { company, employees } = props.report;
  const active = employees.filter((person) => person.spentThisWeekMicros > 0).length;
  const blocked = employees.reduce((sum, person) => sum + person.blockedThisWeek, 0);
  const remaining = Math.max(0, company.weeklyPoolMicros - company.spentThisWeekMicros);
  return (
    <section aria-labelledby="kpi-heading" className="kpi-strip">
      <h2 id="kpi-heading" className="visually-hidden">
        This week at a glance
      </h2>
      <dl className="kpi-tiles">
        <Kpi label="Spent this week" value={formatMoney(company.spentThisWeekMicros)} />
        <Kpi label="Pool remaining" value={formatMoney(remaining)} />
        <Kpi label="Active people" value={`${active} of ${employees.length}`} />
        <Kpi label="Blocked requests" value={String(blocked)} />
      </dl>
    </section>
  );
}

function Kpi(props: { label: string; value: string }) {
  return (
    <div className="panel kpi">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}
