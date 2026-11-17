/**
 * Turns the gateway's integer micro-dollars and ratios into the text the dashboard shows. The
 * gateway never sends dollars, so this is the only place a micro becomes a "$".
 */

const MICROS_PER_DOLLAR = 1_000_000;

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Demo requests cost fractions of a cent, so two decimals would show most of them as $0.00.
const centFractions = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * Formats micro-dollars as dollars: two decimals from $1 up ($1,234.56), four below ($0.0110),
 * and exactly zero as $0.00.
 */
export function formatMoney(micros: number): string {
  if (micros === 0) return wholeDollars.format(0);
  const dollars = micros / MICROS_PER_DOLLAR;
  return Math.abs(dollars) >= 1 ? wholeDollars.format(dollars) : centFractions.format(dollars);
}

/**
 * Formats a ratio (0.25) as a whole percent ("25%"). A ratio above zero that rounds to 0 shows
 * as "<1%", so a small but real share doesn't read as nothing.
 */
export function formatPercent(ratio: number): string {
  const percent = Math.round(ratio * 100);
  if (percent === 0 && ratio > 0) return "<1%";
  return `${percent}%`;
}

/** `part / whole`, or 0 when the whole is 0 (an empty pool or a week with no spend). */
export function ratioOf(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
