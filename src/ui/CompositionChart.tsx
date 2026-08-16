import { useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import { CHART_WIDTH, CHART_HEIGHT, CHART_PAD, CHART_AXIS_LABEL_HEIGHT } from "./chartShared";
import { YearAxis } from "./YearAxis";

interface CompositionChartProps {
  speciesNames: string[];
  speciesColors: string[];
}

/** 100%-stacked area of each species' share of total abundance per year —
 * shows competitive dominance/turnover, independent of overall population
 * size (which AbundanceChart already covers). */
export function CompositionChart({ speciesNames, speciesColors }: CompositionChartProps) {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const { history } = snapshot;

  if (history.length < 2) {
    return (
      <div className="composition-chart">
        <h2>Composition</h2>
        <p className="panel-empty">Paint, then Step or Play to see a trend.</p>
      </div>
    );
  }

  const maxStep = history[history.length - 1].step || 1;
  const xFor = (step: number) => CHART_PAD + (step / maxStep) * (CHART_WIDTH - 2 * CHART_PAD);
  // Share is always in [0,1] — fixed y-domain, not data-dependent.
  const yFor = (v: number) => CHART_HEIGHT - CHART_PAD - v * (CHART_HEIGHT - 2 * CHART_PAD);

  // Per point, cumulative share up to and including species s (cum[-1] = 0
  // implicitly). share[s] = 0 when total abundance is 0 (nothing painted yet).
  const cumulativeByPoint = history.map((point) => {
    const total = point.abundance.reduce((a, b) => a + b, 0);
    const cum: number[] = [];
    let running = 0;
    for (const v of point.abundance) {
      running += total > 0 ? v / total : 0;
      cum.push(running);
    }
    return cum;
  });

  return (
    <div className="composition-chart">
      <h2>Composition</h2>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + CHART_AXIS_LABEL_HEIGHT}`}
        role="img"
        aria-label="Share of total abundance by species, by year"
      >
        <YearAxis maxStep={maxStep} xFor={xFor} />
        {speciesNames.map((name, s) => {
          const top = history.map((point, i) => `${xFor(point.step)},${yFor(cumulativeByPoint[i][s])}`);
          const bottom = history
            .map((point, i) => `${xFor(point.step)},${yFor(s === 0 ? 0 : cumulativeByPoint[i][s - 1])}`)
            .reverse();
          const d = `M${top.join(" L")} L${bottom.join(" L")} Z`;
          return (
            <path
              key={name}
              d={d}
              fill={speciesColors[s]}
              stroke="var(--panel-bg)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <p className="chart-caption">Share of total abundance by species</p>
    </div>
  );
}
