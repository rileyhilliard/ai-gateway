/**
 * "Who's using the budget": people ranked by what they cost this week, each with a bar for their
 * share of the company's spend, so concentration is visible at a glance.
 */

import type { UsageReport } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent } from "./money";
import { rankSpenders } from "./people";

/** The cost ranking panel. */
export function SpendRanking(props: { report: UsageReport }) {
  const { employees, company } = props.report;
  const ranked = rankSpenders(employees, company.spentThisWeekMicros);
  return (
    <section aria-labelledby="ranking-heading" className="panel">
      <h2 id="ranking-heading">Who's using the budget</h2>
      {ranked.length === 0 ? (
        <p className="muted">Nobody has spent anything this week.</p>
      ) : (
        <ol className="bar-list">
          {ranked.map((spender) => {
            const money = formatMoney(spender.spentThisWeekMicros);
            const share = formatPercent(spender.share);
            return (
              <li key={spender.label} className="bar-row">
                <span className="bar-label">{spender.label}</span>
                <DotBar
                  fraction={spender.share}
                  tone="rank"
                  label={`${spender.label}: ${money}, ${share} of this week's spend`}
                />
                <span className="bar-value">{money}</span>
                <span className="bar-detail">{share}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
