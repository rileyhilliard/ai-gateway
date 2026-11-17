/**
 * Placeholder panels shown until the first usage report arrives, shaped like the page so it
 * doesn't jump when the data lands.
 */

const PANEL_HEIGHTS = ["10rem", "5rem", "14rem", "18rem"];

/** The loading state: empty panels, announced once as "Loading usage". */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading usage" className="dashboard-skeleton">
      {PANEL_HEIGHTS.map((height, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders that never reorder
          key={index}
          className="panel skeleton"
          style={{ height }}
        />
      ))}
    </div>
  );
}
