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
 * predictions) on the map, via two independent toggles: the full history up
 * to the current year, and just the current year's new detections (drawn
 * with a bright outline ring) — the same visual language as the reference
 * artifact ("Surtsey Colonisation — Step Viewer"), adapted for this app's
 * dark theme (a near-white ring here, where the artifact used black on a
 * light page). Either toggle works alone; with both on, this year's points
 * render on top of the full history so they still stand out.
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
  const showCumulative = useUIStore((s) => s.showOccurrencesCumulative);
  const showCurrentYear = useUIStore((s) => s.showOccurrencesCurrentYear);
  // getSnapshot returns a primitive, so useSyncExternalStore only re-renders
  // this component when the EFFECTIVE year actually changes, even though
  // gridStore notifies on every sub-step (paint/erase/model steps) — exactly
  // the "skip redraw when the year hasn't changed" behavior we want, for free.
  const effectiveYear = useSyncExternalStore(
    (cb) => gridStore.subscribe(cb),
    () => Math.min(gridStore.currentYear, gridStore.yearEnd)
  );

  // Years strictly before the current one, shown plain (no ring) — the
  // current year is handled separately below so its ring applies only when
  // showCurrentYear is on, independent of whether cumulative is on too.
  const priorYears = useMemo(() => {
    if (!showCumulative) return [];
    const events = [];
    for (let year = gridStore.yearStart; year < effectiveYear; year++) {
      const forYear = gridStore.occurrencesByYear.get(year);
      if (forYear) events.push(...forYear);
    }
    return events;
  }, [showCumulative, effectiveYear]);

  const currentYear = useMemo(() => {
    if (!showCumulative && !showCurrentYear) return [];
    return gridStore.occurrencesByYear.get(effectiveYear) ?? [];
  }, [showCumulative, showCurrentYear, effectiveYear]);

  if (priorYears.length === 0 && currentYear.length === 0) return null;

  const { gridW, gridH } = gridStore;
  // Current-year points get the ring only when that toggle is actually on —
  // when only "cumulative" is checked, this year's points render plain,
  // indistinguishable from prior years.
  const ringCurrentYear = showCurrentYear;

  return (
    <svg
      className="occurrence-layer"
      viewBox={`0 0 ${gridW} ${gridH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {priorYears.map((event, i) => (
        <Marker
          key={`prior-${i}`}
          shape={MARKER_SHAPES[event.species % MARKER_SHAPES.length]}
          cx={event.col + 0.5}
          cy={event.row + 0.5}
          r={MARKER_RADIUS}
          fill={speciesColors[event.species] ?? "#fff"}
        />
      ))}
      {currentYear.map((event, i) => (
        <Marker
          key={`current-${i}`}
          shape={MARKER_SHAPES[event.species % MARKER_SHAPES.length]}
          cx={event.col + 0.5}
          cy={event.row + 0.5}
          r={MARKER_RADIUS}
          fill={speciesColors[event.species] ?? "#fff"}
          stroke={ringCurrentYear ? "var(--text)" : undefined}
          strokeWidth={ringCurrentYear ? NEW_STROKE_WIDTH : undefined}
        />
      ))}
    </svg>
  );
}
