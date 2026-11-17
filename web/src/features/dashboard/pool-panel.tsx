/**
 * The pool panel answers "are we on track for this week's pool?". It is the page's one hero: spend
 * against the pool, a bar that marks today and extends to the projected spend by Monday, the pace
 * status, and a line of supporting numbers (pool left, active people, blocked requests).
 */

import type { UsageReport } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent, ratioOf } from "./money";
import { type PoolPace, poolPace, weekElapsedFraction } from "./pace";
import { formatResetTime } from "./time";

const POOL_BAR_CELLS = 64;

/** The weekly pool's spend, bar, pace status and supporting numbers. */
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
      <div className="pool-top">
        <div>
          <h2 id="pool-heading" className="pool-heading">
            Weekly pool
          </h2>
          <p className="pool-figures">
            <span className="pool-spent">{formatMoney(spent)}</span>{" "}
            <span className="pool-total">{`of ${formatMoney(pool)}`}</span>{" "}
            <span className="pool-percent">{`${formatPercent(used)} used`}</span>
          </p>
        </div>
        <PaceStatus pace={pace} weekResetsAt={report.weekResetsAt} />
      </div>
      <PoolBar used={used} elapsed={elapsed} spent={spent} pool={pool} pace={pace} />
      <PoolStats report={report} />
    </section>
  );
}

/**
 * Where a label hangs from its point: centred in the first half, and ending at the point past
 * halfway, so labels stay inside the bar and clear of the pool label at the end.
 */
function anchorFor(at: number): "start" | "middle" | "end" {
  if (at < 0.15) return "start";
  if (at > 0.5) return "end";
  return "middle";
}

function BarLabel(props: { at: number; className: string; text: string }) {
  const at = Math.min(1, Math.max(0, props.at));
  return (
    <span
      className={`bar-label-at ${props.className} anchor-${anchorFor(at)}`}
      style={{ left: `${at * 100}%` }}
    >
      {props.text}
    </span>
  );
}

/**
 * The pool bar: spend lit, the projection dimly lit beyond it up to the pool's end, and a tick
 * at how much of the week has gone, each labelled in place.
 */
function PoolBar(props: {
  used: number;
  elapsed: number;
  spent: number;
  pool: number;
  pace: PoolPace;
}) {
  const projection = "projectedMicros" in props.pace ? props.pace : undefined;
  const label = [
    `Pool used: ${formatMoney(props.spent)} of ${formatMoney(props.pool)} (${formatPercent(props.used)}).`,
    `${formatPercent(props.elapsed)} of the week has gone.`,
    projection ? `Projected ${formatMoney(projection.projectedMicros)} by Monday.` : "",
  ]
    .join(" ")
    .trim();
  return (
    <div className="pool-bar">
      <div aria-hidden="true" className="bar-labels bar-labels-above">
        {projection && (
          <BarLabel
            at={projection.poolShare}
            className="label-projected"
            text={`${projection.poolShare > 1 ? "Heading for " : "Projected "}${formatMoney(projection.projectedMicros)}`}
          />
        )}
      </div>
      <DotBar
        fraction={props.used}
        projected={projection?.poolShare}
        marker={props.elapsed}
        cells={POOL_BAR_CELLS}
        tone="usage"
        label={label}
      />
      <div aria-hidden="true" className="bar-labels bar-labels-below">
        <BarLabel
          at={props.elapsed}
          className="label-today"
          text={`Today, ${formatPercent(props.elapsed)} of the week`}
        />
        {/* Late in the week the today label reaches the end, so the pool label steps aside. */}
        {props.elapsed < 0.75 && (
          <BarLabel at={1} className="label-limit" text={`${formatMoney(props.pool)} pool`} />
        )}
      </div>
    </div>
  );
}

const PACE_TONE: Record<PoolPace["kind"], string> = {
  "pool-spent": "tone-error",
  "too-early": "tone-muted",
  "on-pace": "tone-success",
  "over-pace": "tone-waiting",
};

function paceWords(pace: PoolPace, weekResetsAt: string): { title: string; detail: string } {
  switch (pace.kind) {
    case "pool-spent":
      return {
        title: "Pool spent",
        detail: `every request is blocked until ${formatResetTime(weekResetsAt)}`,
      };
    case "too-early":
      return { title: "Too early to project", detail: "less than 2% of the week has gone" };
    case "on-pace":
      return {
        title: "On pace",
        detail: `projected ${formatMoney(pace.projectedMicros)} by Monday, ${formatPercent(pace.poolShare)} of the pool`,
      };
    case "over-pace":
      return {
        title: "Over pace",
        detail: `projected ${formatMoney(pace.projectedMicros)} by Monday, ${formatPercent(pace.poolShare)} of the pool`,
      };
  }
}

function PaceStatus(props: { pace: PoolPace; weekResetsAt: string }) {
  const words = paceWords(props.pace, props.weekResetsAt);
  return (
    <p className={`pace-status ${PACE_TONE[props.pace.kind]}`}>
      <span aria-hidden="true" className="status-dot" />
      <span className="pace-title">{words.title}</span>{" "}
      <span className="pace-detail">{words.detail}</span>
    </p>
  );
}

/** Pool left, how many people spent this week, and blocked requests: the numbers under the bar. */
function PoolStats(props: { report: UsageReport }) {
  const { company, employees } = props.report;
  const active = employees.filter((person) => person.spentThisWeekMicros > 0).length;
  const blocked = employees.reduce((sum, person) => sum + person.blockedThisWeek, 0);
  const remaining = Math.max(0, company.weeklyPoolMicros - company.spentThisWeekMicros);
  return (
    <ul className="pool-stats">
      <li>
        <span className="stat">{formatMoney(remaining)}</span> left in the pool
      </li>
      <li>
        <span className="stat">{`${active} of ${employees.length}`}</span> people active
      </li>
      <li>
        <span className="stat">{blocked}</span>{" "}
        {blocked === 1 ? "blocked request" : "blocked requests"}
      </li>
    </ul>
  );
}
