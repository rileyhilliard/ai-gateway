/**
 * Placeholders shown until the first usage report arrives, shaped like the page (the pool hero,
 * then table rows) so it doesn't jump when the data lands.
 */

const ROW_COUNT = 5;

/** The loading state: the page's outline, announced once as "Loading usage". */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading usage" className="dashboard-skeleton">
      <div className="skeleton skeleton-title" />
      <div className="panel skeleton skeleton-hero" />
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders that never reorder
        <div key={index} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
