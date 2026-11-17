/**
 * A React hook that re-renders once a second with the current time, so "updated 2 s ago" keeps
 * counting between polls. The clock is read here, at the edge, and passed to pure formatters.
 */

import { useEffect, useState } from "react";

const TICK_MS = 1_000;

/** The current time in epoch milliseconds, refreshed every second while mounted. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
