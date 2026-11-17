/**
 * Draws a horizontal bar as a row of SVG dots, the way rr's monitor draws usage. Usage bars color
 * each lit dot by where it sits (cyan under 60%, purple to 85%, pink past it); ranking bars are
 * cyan throughout. The aria-label carries the numbers, since the dots are decoration.
 */

const CELLS = 40;

/** How the lit dots are colored: by usage threshold, or one flat color for a ranking. */
export type DotBarTone = "usage" | "rank";

function usageClass(position: number): string {
  if (position < 0.6) return "dot-info";
  if (position <= 0.85) return "dot-sync";
  return "dot-accent";
}

/**
 * A dot bar filled to `fraction` (clamped to 0..1), with an optional `marker` line at another
 * fraction, such as how far through the week we are.
 */
export function DotBar(props: {
  fraction: number;
  label: string;
  tone: DotBarTone;
  marker?: number;
}) {
  const lit = Math.round(Math.min(1, Math.max(0, props.fraction)) * CELLS);
  // A sliver of real spend still lights one dot, so nonzero never looks like zero.
  const litCells = lit === 0 && props.fraction > 0 ? 1 : lit;
  return (
    <svg
      role="img"
      aria-label={props.label}
      viewBox={`0 0 ${CELLS * 2} 3`}
      preserveAspectRatio="none"
      className="dot-bar"
    >
      {Array.from({ length: CELLS }, (_, index) => {
        const tone = props.tone === "usage" ? usageClass((index + 1) / CELLS) : "dot-info";
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional and never reorder
            key={index}
            x={index * 2 + 0.2}
            y={0.5}
            width={1.6}
            height={2}
            rx={0.3}
            className={index < litCells ? tone : "dot-empty"}
          />
        );
      })}
      {props.marker !== undefined && (
        <rect
          x={Math.min(1, Math.max(0, props.marker)) * CELLS * 2 - 0.15}
          y={0}
          width={0.3}
          height={3}
          className="dot-marker"
        />
      )}
    </svg>
  );
}
