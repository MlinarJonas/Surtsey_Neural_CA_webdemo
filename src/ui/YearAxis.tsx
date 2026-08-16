import { gridStore } from "../state/gridStore";
import { CHART_WIDTH, CHART_HEIGHT, CHART_PAD, niceTickInterval } from "./chartShared";

interface YearAxisProps {
  maxStep: number;
  xFor: (step: number) => number;
}

/** Baseline + year tick marks/labels shared by every chart below the plotted
 * series — x positions come from the caller's own xFor (each chart maps step
 * to pixel space identically, but keeps its own y-scale). */
export function YearAxis({ maxStep, xFor }: YearAxisProps) {
  const yearStart = gridStore.yearStart;
  const maxYear = yearStart + maxStep;
  const tickInterval = niceTickInterval(maxYear - yearStart, 4);
  const yearTicks: number[] = [];
  for (let y = Math.ceil(yearStart / tickInterval) * tickInterval; y <= maxYear; y += tickInterval) {
    yearTicks.push(y);
  }
  const axisY = CHART_HEIGHT - CHART_PAD;

  return (
    <>
      <line x1={CHART_PAD} y1={axisY} x2={CHART_WIDTH - CHART_PAD} y2={axisY} className="chart-axis" />
      {yearTicks.map((year) => {
        const x = xFor(year - yearStart);
        // Center-anchored text overflows the viewBox for ticks near either
        // edge (a 4-digit label is wider than the padding) — edge ticks
        // anchor outward from the boundary instead, tick mark position stays exact.
        const nearLeft = x < 12;
        const nearRight = x > CHART_WIDTH - 12;
        const anchor = nearLeft ? "start" : nearRight ? "end" : "middle";
        const textX = nearLeft ? 0 : nearRight ? CHART_WIDTH : x;
        return (
          <g key={year}>
            <line x1={x} y1={axisY} x2={x} y2={axisY + 3} className="chart-axis" />
            <text x={textX} y={axisY + 13} textAnchor={anchor} className="chart-tick-label">
              {year}
            </text>
          </g>
        );
      })}
    </>
  );
}
