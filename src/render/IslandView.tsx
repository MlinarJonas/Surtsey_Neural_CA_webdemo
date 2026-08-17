import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";
import { HillshadeLayer } from "./HillshadeLayer";
import { GridCanvas } from "./GridCanvas";
import { OccurrenceLayer } from "./OccurrenceLayer";
import { BrushCursorLayer } from "./BrushCursorLayer";
import { YearHUD } from "./YearHUD";

interface IslandViewProps {
  /** Hex colors, parallel to gridStore.speciesNames. */
  speciesColors: string[];
  /** Base (unshrunk) displayed pixel size of one grid cell — the actual
   * rendered size can be smaller on narrow viewports, see .canvas-stack's
   * max-width/aspect-ratio in App.css. */
  cellSize?: number;
}

/**
 * Owns the stacked-canvas viewport: static hillshade terrain beneath, crisp
 * per-cell species state above (land cells in GridCanvas are transparent
 * where nothing is painted, so the terrain shows through), and a brush
 * cursor ghost preview + glow ring on top. GridCanvas, HillshadeLayer, and
 * BrushCursorLayer don't know about each other — this component is the only
 * place that knows the full stack.
 *
 * Sizing: this wrapper sets an explicit base width plus aspect-ratio, and
 * every child (canvases via CSS, the ring/glyph via % position here) is
 * expressed relative to that box rather than in absolute pixels — so the
 * whole stack shrinks correctly together on a narrow viewport instead of
 * only the width shrinking while height stays fixed (which is what a fixed
 * pixel height would do, since CSS max-width has no effect on height).
 */
export function IslandView({ speciesColors, cellSize = 3 }: IslandViewProps) {
  const { gridW, gridH } = gridStore;
  const hoveredCell = useUIStore((s) => s.hoveredCell);
  const tool = useUIStore((s) => s.tool);
  const selectedSpecies = useUIStore((s) => s.selectedSpecies);
  const brushRadius = useUIStore((s) => s.brushRadius);

  // The ring is a coarse circular approximation of the brush's true (circular,
  // integer-cell) footprint — decorative glow only; BrushCursorLayer's
  // per-cell canvas fill is the pixel-exact preview. Percentages, not pixels:
  // width/height use gridW/gridH as their respective bases (not the same
  // number) specifically so the ring renders as a circle, not an ellipse,
  // regardless of the container's current (possibly shrunk) size.
  const ringColor = tool === "erase" ? "var(--danger)" : (speciesColors[selectedSpecies] ?? "#fff");
  const ringWidthPct = ((2 * brushRadius + 1) / gridW) * 100;
  const ringHeightPct = ((2 * brushRadius + 1) / gridH) * 100;
  const pointXPct = hoveredCell ? ((hoveredCell.col + 0.5) / gridW) * 100 : 0;
  const pointYPct = hoveredCell ? ((hoveredCell.row + 0.5) / gridH) * 100 : 0;

  return (
    <div
      className="canvas-stack"
      style={{ width: gridW * cellSize, aspectRatio: `${gridW} / ${gridH}` }}
    >
      <HillshadeLayer />
      <GridCanvas speciesColors={speciesColors} />
      <OccurrenceLayer speciesColors={speciesColors} />
      <BrushCursorLayer speciesColors={speciesColors} />
      <YearHUD />
      {hoveredCell && (
        <div
          className="brush-ring"
          style={{
            left: `${pointXPct}%`,
            top: `${pointYPct}%`,
            width: `${ringWidthPct}%`,
            height: `${ringHeightPct}%`,
            transform: "translate(-50%, -50%)",
            borderColor: ringColor,
            boxShadow: `0 0 8px 1px ${ringColor}`,
          }}
        />
      )}
      {hoveredCell && tool === "erase" && (
        <svg
          className="erase-glyph"
          width={16}
          height={16}
          viewBox="0 0 16 16"
          style={{
            left: `${pointXPct}%`,
            top: `${pointYPct}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <line x1={3} y1={3} x2={13} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
          <line x1={13} y1={3} x2={3} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
