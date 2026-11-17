/**
 * Shows how fresh the dashboard's numbers are: a green "Live" dot while polls succeed, and an
 * amber "Stale since" once a poll fails after data arrived.
 */

import { formatAge, formatClockTime } from "./time";
import { useNow } from "./use-now";

/** The freshness line in the header. `isStale` is true while the latest poll has failed. */
export function LiveIndicator(props: { updatedAt: number; isStale: boolean }) {
  const now = useNow();
  const tone = props.isStale ? "waiting" : "success";
  return (
    <p role="status" className={`live-indicator live-${tone}`}>
      <span aria-hidden="true" className="live-dot" />
      {props.isStale
        ? `Stale since ${formatClockTime(props.updatedAt)}`
        : `Live, updated ${formatAge(props.updatedAt, now)}`}
    </p>
  );
}
