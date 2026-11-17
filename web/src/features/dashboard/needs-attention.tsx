/**
 * "Needs attention": who is at their limit now or was blocked this week, with the reason in plain
 * words. Someone blocked every day probably needs a bigger tier.
 */

import type { EmployeeUsage } from "../../api/usage";
import { needsAttention } from "./people";

/** The needs-attention panel, or its empty state when nobody is blocked. */
export function NeedsAttention(props: { employees: readonly EmployeeUsage[] }) {
  const items = needsAttention(props.employees);
  return (
    <section aria-labelledby="attention-heading" className="panel">
      <h2 id="attention-heading">Needs attention</h2>
      {items.length === 0 ? (
        <p className="tone-success">Nobody is blocked this week.</p>
      ) : (
        <ul className="attention-list">
          {items.map((item) => (
            <li key={item.employeeId}>
              <strong>{item.name}</strong>
              {item.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
