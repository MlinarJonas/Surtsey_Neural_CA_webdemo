/** Shared layout constants for every sidebar time-series chart (Abundance,
 * Composition, Extent, Habitat Selection) — kept in one place so their
 * axes/ticks stay visually identical rather than drifting apart per-component. */
export const CHART_WIDTH = 208;
export const CHART_HEIGHT = 90;
export const CHART_PAD = 4;
export const CHART_AXIS_LABEL_HEIGHT = 14;

/** Rounds a step interval up to a "nice" round number (1/2/5 x10^n) so year
 * ticks land on human-friendly values (1970, 1975, ... not 1969, 1974, ...)
 * regardless of how many years the simulation has run. */
export function niceTickInterval(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3 ? 2 : residual < 7 ? 5 : 10;
  return niceResidual * magnitude;
}
