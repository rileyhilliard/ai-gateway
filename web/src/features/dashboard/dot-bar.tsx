/**
 * Draws a horizontal bar as a row of SVG dots, the way rr's monitor draws usage. A usage bar takes
 * one color from how full it is (cyan under 60%, purple to 85%, pink past it); a share bar is
 * neutral, since a share isn't good or bad. The aria-label carries the numbers.
 */

/** How the lit dots are colored: by how full the bar is, or neutral for a share. */
export type DotBarTone = "usage" | "share";

/** rr monitor's thresholds: info under 60%, sync from 60% to 85%, accent above. */
export function usageSeverity(fraction: number): "info" | "sync" | "accent" {
  if (fraction < 0.6) return "info";
  if (fraction <= 0.85) return "sync";
  return "accent";
}

const clamp = (fraction: number) => Math.min(1, Math.max(0, fraction));

function cellsFor(fraction: number, cells: number): number {
  const lit = Math.round(clamp(fraction) * cells);
  // A sliver of real spend still lights one dot, so nonzero never looks like zero.
  return lit === 0 && fraction > 0 ? 1 : lit;
}

/**
 * A dot bar filled to `fraction` (clamped to 0..1). `projected` dimly lights the dots from the
 * fill to where spend is heading; `marker` draws a tick at another fraction, such as today.
 */
export function DotBar(props: {
  fraction: number;
  label: string;
  tone: DotBarTone;
  cells?: number;
  projected?: number;
  marker?: number;
}) {
  const cells = props.cells ?? 40;
  const lit = cellsFor(props.fraction, cells);
  const projectedTo = props.projected === undefined ? lit : cellsFor(props.projected, cells);
  const litClass = props.tone === "share" ? "dot-share" : `dot-${usageSeverity(props.fraction)}`;
  const projectedClass =
    props.projected === undefined ? "" : `dot-${usageSeverity(props.projected)} dot-projected`;
  const cellClass = (index: number) => {
    if (index < lit) return litClass;
    if (index < projectedTo) return projectedClass;
    return "dot-empty";
  };
  return (
    <svg
      role="img"
      aria-label={props.label}
      viewBox={`0 0 ${cells * 2} 4`}
      preserveAspectRatio="none"
      className="dot-bar"
    >
      {Array.from({ length: cells }, (_, index) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional and never reorder
          key={index}
          x={index * 2 + 0.2}
          y={0.75}
          width={1.6}
          height={2.5}
          rx={0.3}
          className={cellClass(index)}
        />
      ))}
      {props.marker !== undefined && (
        <rect
          x={clamp(props.marker) * cells * 2 - 0.12}
          y={0}
          width={0.24}
          height={4}
          className="dot-marker"
        />
      )}
    </svg>
  );
}
