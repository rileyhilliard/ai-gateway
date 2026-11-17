/**
 * "Needs attention": who is at their limit now or was blocked this week, one line each with a
 * short reason and the blocked count. Someone blocked every day probably needs a bigger tier.
 */

import type { EmployeeUsage } from "../../api/usage";
import { needsAttention } from "./people";

/** The needs-attention list, or one quiet line when nobody is blocked. */
export function NeedsAttention(props: { employees: readonly EmployeeUsage[] }) {
  const items = needsAttention(props.employees);
  return (
    <section aria-labelledby="attention-heading" className="section">
      <div className="section-head">
        <h2 id="attention-heading">Needs attention</h2>
      </div>
      {items.length === 0 ? (
        <p className="quiet">Nobody is blocked this week.</p>
      ) : (
        <ul className="attention-list">
          {items.map((item) => (
            <li key={item.employeeId}>
              <span className="attention-name">{item.name}</span>
              <span className="attention-reason">{item.reason}</span>
              <span className="attention-count">
                <span className="figure">{item.blockedThisWeek}</span> blocked
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
