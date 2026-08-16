import { useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import { gridStore } from "../state/gridStore";

interface AbundanceChartProps {
  speciesNames: string[];
  speciesColors: string[];
}

const WIDTH = 208;
const HEIGHT = 90;
const PAD = 4;
const AXIS_LABEL_HEIGHT = 14; // extra bottom margin reserved for year tick labels
// Past this many series, per-line end-labels start colliding — fall back to
// the (already-present, elsewhere on the page) legend alone.
const MAX_END_LABELS = 3;

/** Rounds a step interval up to a "nice" round number (1/2/5 x10^n) so year
 * ticks land on human-friendly values (1970, 1975, ... not 1969, 1974, ...)
 * regardless of how many years the simulation has run. */
function niceTickInterval(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3 ? 2 : residual < 7 ? 5 : 10;
  return niceResidual * magnitude;
}

export function AbundanceChart({ speciesNames, speciesColors }: AbundanceChartProps) {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const { history } = snapshot;

  if (history.length < 2) {
    return (
      <div className="abundance-chart">
        <h2>Abundance</h2>
        <p className="panel-empty">Paint, then Step or Play to see a trend.</p>
      </div>
    );
  }

  const maxStep = history[history.length - 1].step || 1;
  let maxAbundance = 0;
  for (const point of history) {
    for (const v of point.abundance) maxAbundance = Math.max(maxAbundance, v);
  }
  if (maxAbundance <= 0) maxAbundance = 1;

  const xFor = (step: number) => PAD + (step / maxStep) * (WIDTH - 2 * PAD);
  const yFor = (v: number) => HEIGHT - PAD - (v / maxAbundance) * (HEIGHT - 2 * PAD);

  const yearStart = gridStore.yearStart;
  const maxYear = yearStart + maxStep;
  const tickInterval = niceTickInterval(maxYear - yearStart, 4);
  const yearTicks: number[] = [];
  for (let y = Math.ceil(yearStart / tickInterval) * tickInterval; y <= maxYear; y += tickInterval) {
    yearTicks.push(y);
  }

  return (
    <div className="abundance-chart">
      <h2>Abundance</h2>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + AXIS_LABEL_HEIGHT}`}
        role="img"
        aria-label="Total species occupancy by year"
      >
        <line
          x1={PAD}
          y1={HEIGHT - PAD}
          x2={WIDTH - PAD}
          y2={HEIGHT - PAD}
          className="chart-axis"
        />
        {yearTicks.map((year) => {
          const x = xFor(year - yearStart);
          // Center-anchored text overflows the viewBox for ticks near either
          // edge (a 4-digit label is wider than the padding) — edge ticks
          // anchor outward from the boundary instead, tick mark position stays exact.
          const nearLeft = x < 12;
          const nearRight = x > WIDTH - 12;
          const anchor = nearLeft ? "start" : nearRight ? "end" : "middle";
          const textX = nearLeft ? 0 : nearRight ? WIDTH : x;
          return (
            <g key={year}>
              <line x1={x} y1={HEIGHT - PAD} x2={x} y2={HEIGHT - PAD + 3} className="chart-axis" />
              <text x={textX} y={HEIGHT - PAD + 13} textAnchor={anchor} className="chart-tick-label">
                {year}
              </text>
            </g>
          );
        })}
        {speciesNames.map((name, s) => {
          const d = history
            .map((point, i) => `${i === 0 ? "M" : "L"}${xFor(point.step)},${yFor(point.abundance[s])}`)
            .join(" ");
          const last = history[history.length - 1];
          return (
            <g key={name}>
              <path d={d} fill="none" stroke={speciesColors[s]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {speciesNames.length <= MAX_END_LABELS && (
                <>
                  <circle
                    cx={xFor(last.step)}
                    cy={yFor(last.abundance[s])}
                    r={3}
                    fill={speciesColors[s]}
                    stroke="var(--panel-bg)"
                    strokeWidth={2}
                  />
                  <text
                    x={xFor(last.step) - 4}
                    y={yFor(last.abundance[s]) - 6}
                    textAnchor="end"
                    className="chart-end-label"
                  >
                    {last.abundance[s].toFixed(1)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="chart-caption">Total occupancy (sum of biotic, land cells) vs. step</p>
    </div>
  );
}
