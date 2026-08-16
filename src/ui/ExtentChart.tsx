import { useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import { CHART_WIDTH, CHART_HEIGHT, CHART_PAD, CHART_AXIS_LABEL_HEIGHT } from "./chartShared";
import { YearAxis } from "./YearAxis";

interface ExtentChartProps {
  speciesNames: string[];
  speciesColors: string[];
}

const MAX_END_LABELS = 3;

/** Count of occupied land cells per species per year — a spread/dispersal
 * signal distinct from AbundanceChart's density-weighted sum: a species can
 * grow denser without spreading further, or vice versa. */
export function ExtentChart({ speciesNames, speciesColors }: ExtentChartProps) {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const { history } = snapshot;

  if (history.length < 2) {
    return (
      <div className="extent-chart">
        <h2>Range</h2>
        <p className="panel-empty">Paint, then Step or Play to see a trend.</p>
      </div>
    );
  }

  const maxStep = history[history.length - 1].step || 1;
  let maxExtent = 0;
  for (const point of history) {
    for (const v of point.extent) maxExtent = Math.max(maxExtent, v);
  }
  if (maxExtent <= 0) maxExtent = 1;

  const xFor = (step: number) => CHART_PAD + (step / maxStep) * (CHART_WIDTH - 2 * CHART_PAD);
  const yFor = (v: number) => CHART_HEIGHT - CHART_PAD - (v / maxExtent) * (CHART_HEIGHT - 2 * CHART_PAD);

  return (
    <div className="extent-chart">
      <h2>Range</h2>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + CHART_AXIS_LABEL_HEIGHT}`}
        role="img"
        aria-label="Occupied land cells by species, by year"
      >
        <YearAxis maxStep={maxStep} xFor={xFor} />
        {speciesNames.map((name, s) => {
          const d = history
            .map((point, i) => `${i === 0 ? "M" : "L"}${xFor(point.step)},${yFor(point.extent[s])}`)
            .join(" ");
          const last = history[history.length - 1];
          return (
            <g key={name}>
              <path d={d} fill="none" stroke={speciesColors[s]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {speciesNames.length <= MAX_END_LABELS && (
                <>
                  <circle
                    cx={xFor(last.step)}
                    cy={yFor(last.extent[s])}
                    r={3}
                    fill={speciesColors[s]}
                    stroke="var(--panel-bg)"
                    strokeWidth={2}
                  />
                  <text
                    x={xFor(last.step) - 4}
                    y={yFor(last.extent[s]) - 6}
                    textAnchor="end"
                    className="chart-end-label"
                  >
                    {last.extent[s]}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="chart-caption">Occupied land cells (biotic &gt; 0.1) vs. year</p>
    </div>
  );
}
