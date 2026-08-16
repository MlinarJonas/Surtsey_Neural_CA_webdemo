import { useState, useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import { CHART_WIDTH, CHART_HEIGHT, CHART_PAD, CHART_AXIS_LABEL_HEIGHT } from "./chartShared";
import { YearAxis } from "./YearAxis";

interface SuitabilityChartProps {
  speciesNames: string[];
  speciesColors: string[];
  abioticChannelNames: string[];
}

const MAX_END_LABELS = 3;

/** Mean value of a chosen abiotic channel over each species' occupied cells,
 * per year — shows whether a species stays in suitable habitat as it spreads
 * (flat/high) or gets pushed into marginal ground (e.g. by competition). The
 * selected channel is view-local UI state, not shared with any other panel. */
export function SuitabilityChart({ speciesNames, speciesColors, abioticChannelNames }: SuitabilityChartProps) {
  const [channel, setChannel] = useState(0);
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const { history } = snapshot;

  if (history.length < 2) {
    return (
      <div className="suitability-chart">
        <h2>Suitability</h2>
        <p className="panel-empty">Paint, then Step or Play to see a trend.</p>
      </div>
    );
  }

  const maxStep = history[history.length - 1].step || 1;
  const xFor = (step: number) => CHART_PAD + (step / maxStep) * (CHART_WIDTH - 2 * CHART_PAD);
  // Abiotic values are always normalized [0,1] — fixed y-domain keeps the
  // scale comparable when the user switches channels.
  const yFor = (v: number) => CHART_HEIGHT - CHART_PAD - v * (CHART_HEIGHT - 2 * CHART_PAD);

  const meanAt = (point: (typeof history)[number], s: number): number =>
    point.extent[s] > 0 ? point.abioticSum[s][channel] / point.extent[s] : 0;

  return (
    <div className="suitability-chart">
      <h2>Suitability</h2>
      <select
        className="chart-channel-select"
        value={channel}
        onChange={(e) => setChannel(Number(e.target.value))}
        aria-label="Abiotic channel"
      >
        {abioticChannelNames.map((name, c) => (
          <option key={name} value={c}>
            {name}
          </option>
        ))}
      </select>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + CHART_AXIS_LABEL_HEIGHT}`}
        role="img"
        aria-label="Mean abiotic channel value at occupied cells, by species, by year"
      >
        <YearAxis maxStep={maxStep} xFor={xFor} />
        {speciesNames.map((name, s) => {
          const d = history
            .map((point, i) => `${i === 0 ? "M" : "L"}${xFor(point.step)},${yFor(meanAt(point, s))}`)
            .join(" ");
          const last = history[history.length - 1];
          return (
            <g key={name}>
              <path d={d} fill="none" stroke={speciesColors[s]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {speciesNames.length <= MAX_END_LABELS && (
                <>
                  <circle
                    cx={xFor(last.step)}
                    cy={yFor(meanAt(last, s))}
                    r={3}
                    fill={speciesColors[s]}
                    stroke="var(--panel-bg)"
                    strokeWidth={2}
                  />
                  <text
                    x={xFor(last.step) - 4}
                    y={yFor(meanAt(last, s)) - 6}
                    textAnchor="end"
                    className="chart-end-label"
                  >
                    {meanAt(last, s).toFixed(2)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="chart-caption">Mean value of selected abiotic channel at occupied cells</p>
    </div>
  );
}
