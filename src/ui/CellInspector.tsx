import { useUIStore } from "../state/uiStore";
import { useGridStoreTick } from "../state/useGridStoreTick";
import { gridStore } from "../state/gridStore";

interface CellInspectorProps {
  speciesNames: string[];
  speciesColors: string[];
  abioticChannelNames: string[];
}

export function CellInspector({ speciesNames, speciesColors, abioticChannelNames }: CellInspectorProps) {
  useGridStoreTick(); // re-render on grid/year changes so values stay live while hovering
  const hovered = useUIStore((s) => s.hoveredCell);

  return (
    <div className="cell-inspector">
      <h2>Cell inspector</h2>
      {!hovered ? (
        <p className="panel-empty">Hover the island to inspect a cell.</p>
      ) : (
        <>
          <p className="inspector-coords">
            row {hovered.row}, col {hovered.col} —{" "}
            {gridStore.isLand(hovered.row, hovered.col) ? "land" : "ocean"}
          </p>
          <ul className="inspector-values">
            {speciesNames.map((name, s) => {
              const idx = hovered.row * gridStore.gridW + hovered.col;
              const value = gridStore.biotic[s]?.[idx] ?? 0;
              return (
                <li key={name}>
                  <span className="swatch" style={{ backgroundColor: speciesColors[s] }} />
                  <span className="species-name">{name}</span>
                  <span className="inspector-value">{value.toFixed(3)}</span>
                </li>
              );
            })}
          </ul>

          {/* Terrain/coastline freeze at yearEnd once the simulation runs past
              the real data range (see gridStore.setYear) — label the year
              actually backing these values, not the (possibly later) displayed one. */}
          <h3>Abiotic ({Math.min(gridStore.currentYear, gridStore.yearEnd)})</h3>
          <ul className="inspector-values">
            {abioticChannelNames.map((name, c) => {
              const idx = hovered.row * gridStore.gridW + hovered.col;
              const value = gridStore.abiotic[c]?.[idx] ?? 0;
              return (
                <li key={name}>
                  <span className="species-name">{name}</span>
                  <span className="inspector-value">{value.toFixed(3)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
