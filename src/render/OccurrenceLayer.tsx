import { useMemo, useSyncExternalStore } from "react";
import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";
import { MARKER_SHAPES } from "../ui/markerShapeTypes";
import { Marker } from "../ui/markerShapes";

interface OccurrenceLayerProps {
  /** Hex colors, parallel to gridStore.speciesNames. */
  speciesColors: string[];
}

const MARKER_RADIUS = 1.8; // grid-cell units — see the viewBox note below
const NEW_STROKE_WIDTH = 0.7;

/**
 * Overlays the real occurrence record (actual survey detections, not model
 * predictions) on the map: cumulative up to the current year, per-species
 * shape + color, with the current year's new detections getting a bright
 * outline ring — the same visual language as the reference artifact
 * ("Surtsey Colonisation — Step Viewer"), adapted for this app's dark theme
 * (a near-white ring here, where the artifact used black on a light page).
 *
 * A single <svg> with a viewBox in grid-cell units, not one positioned DOM
 * element per point (unlike .brush-ring/.erase-glyph) — at up to ~4600
 * cumulative points, one container with plain shape children is far cheaper
 * than that many separately-positioned elements. preserveAspectRatio="none"
 * because the container's own aspect-ratio (set in IslandView) already
 * matches gridW:gridH, so 1 viewBox unit is already a true, non-stretched
 * grid cell in both directions — same technique .brush-ring's width%/height%
 * split uses for the same reason.
 */
export function OccurrenceLayer({ speciesColors }: OccurrenceLayerProps) {
  const showOccurrences = useUIStore((s) => s.showOccurrences);
  // getSnapshot returns a primitive, so useSyncExternalStore only re-renders
  // this component when the EFFECTIVE year actually changes, even though
  // gridStore notifies on every sub-step (paint/erase/model steps) — exactly
  // the "skip redraw when the year hasn't changed" behavior we want, for free.
  const effectiveYear = useSyncExternalStore(
    (cb) => gridStore.subscribe(cb),
    () => Math.min(gridStore.currentYear, gridStore.yearEnd)
  );

  const cumulative = useMemo(() => {
    if (!showOccurrences) return [];
    const events = [];
    for (let year = gridStore.yearStart; year <= effectiveYear; year++) {
      const forYear = gridStore.occurrencesByYear.get(year);
      if (forYear) events.push(...forYear);
    }
    return events;
  }, [showOccurrences, effectiveYear]);

  if (!showOccurrences || cumulative.length === 0) return null;

  const { gridW, gridH } = gridStore;

  return (
    <svg
      className="occurrence-layer"
      viewBox={`0 0 ${gridW} ${gridH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {cumulative.map((event, i) => {
        const isNew = event.year === effectiveYear;
        return (
          <Marker
            key={i}
            shape={MARKER_SHAPES[event.species % MARKER_SHAPES.length]}
            cx={event.col + 0.5}
            cy={event.row + 0.5}
            r={MARKER_RADIUS}
            fill={speciesColors[event.species] ?? "#fff"}
            stroke={isNew ? "var(--text)" : undefined}
            strokeWidth={isNew ? NEW_STROKE_WIDTH : undefined}
          />
        );
      })}
    </svg>
  );
}
