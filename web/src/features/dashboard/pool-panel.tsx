/**
 * The pool panel answers "are we on track for this week's pool?": spend against the pool, a bar
 * with a marker at how much of the week has gone, and a projection to Monday.
 */

import type { UsageReport } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent, ratioOf } from "./money";
import { type PoolPace, poolPace, weekElapsedFraction } from "./pace";
import { formatResetTime } from "./time";

/** The weekly pool's spend, bar and pace line. */
export function PoolPanel(props: { report: UsageReport }) {
  const { report } = props;
  const { spentThisWeekMicros: spent, weeklyPoolMicros: pool } = report.company;
  const used = ratioOf(spent, pool);
  const elapsed = weekElapsedFraction(report.asOf, report.weekResetsAt);
  const pace = poolPace({
    ...report.company,
    asOf: report.asOf,
    weekResetsAt: report.weekResetsAt,
  });
  return (
    <section aria-labelledby="pool-heading" className="panel pool-panel">
      <h2 id="pool-heading">Weekly pool</h2>
      <p className="pool-figures">
        <span className="pool-spent">{formatMoney(spent)}</span>{" "}
        <span className="pool-total">{`of ${formatMoney(pool)}`}</span>{" "}
        <span className="pool-percent">{`${formatPercent(used)} used`}</span>
      </p>
      <PoolBar used={used} elapsed={elapsed} spent={spent} pool={pool} />
      <PaceLine pace={pace} weekResetsAt={report.weekResetsAt} />
    </section>
  );
}

/** The pool bar, with the pace marker where spend would be if it were spread evenly. */
function PoolBar(props: { used: number; elapsed: number; spent: number; pool: number }) {
  const label = `Pool used: ${formatMoney(props.spent)} of ${formatMoney(props.pool)} (${formatPercent(props.used)}). ${formatPercent(props.elapsed)} of the week has gone.`;
  return (
    <div className="pool-bar">
      <DotBar fraction={props.used} marker={props.elapsed} tone="usage" label={label} />
      <p className="pool-bar-legend muted">
        {`The white line marks ${formatPercent(props.elapsed)} of the week gone.`}
      </p>
    </div>
  );
}

function PaceLine(props: { pace: PoolPace; weekResetsAt: string }) {
  const { pace } = props;
  switch (pace.kind) {
    case "pool-spent":
      return (
        <p className="pace-line tone-error">
          {`Pool spent: requests past people's allowances are blocked until ${formatResetTime(props.weekResetsAt)}.`}
        </p>
      );
    case "too-early":
      return (
        <p className="pace-line muted">Too early to project: less than 2% of the week has gone.</p>
      );
    case "on-pace":
      return (
        <p className="pace-line tone-success">
          {`On pace: projected ${formatMoney(pace.projectedMicros)} by Monday (${formatPercent(pace.poolShare)} of pool)`}
        </p>
      );
    case "over-pace":
      return (
        <p className="pace-line tone-waiting">
          {`Over pace: projected ${formatMoney(pace.projectedMicros)}, ${formatPercent(pace.poolShare)} of the pool`}
        </p>
      );
  }
}
