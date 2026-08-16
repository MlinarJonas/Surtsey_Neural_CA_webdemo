import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";
import { HillshadeLayer } from "./HillshadeLayer";
import { GridCanvas } from "./GridCanvas";
import { BrushCursorLayer } from "./BrushCursorLayer";
import { YearHUD } from "./YearHUD";

interface IslandViewProps {
  /** Hex colors, parallel to gridStore.speciesNames. */
  speciesColors: string[];
  cellSize?: number;
}

/**
 * Owns the stacked-canvas viewport: static hillshade terrain beneath, crisp
 * per-cell species state above (land cells in GridCanvas are transparent
 * where nothing is painted, so the terrain shows through), and a brush
 * cursor ghost preview + glow ring on top. GridCanvas, HillshadeLayer, and
 * BrushCursorLayer don't know about each other — this component is the only
 * place that knows the full stack.
 */
export function IslandView({ speciesColors, cellSize = 3 }: IslandViewProps) {
  const { gridW, gridH } = gridStore;
  const hoveredCell = useUIStore((s) => s.hoveredCell);
  const tool = useUIStore((s) => s.tool);
  const selectedSpecies = useUIStore((s) => s.selectedSpecies);
  const brushRadius = useUIStore((s) => s.brushRadius);

  // The ring is a coarse circular approximation of the brush's true (circular,
  // integer-cell) footprint — decorative glow only; BrushCursorLayer's
  // per-cell canvas fill is the pixel-exact preview.
  const ringColor = tool === "erase" ? "var(--danger)" : (speciesColors[selectedSpecies] ?? "#fff");
  const diameter = (2 * brushRadius + 1) * cellSize;
  const ringX = hoveredCell ? (hoveredCell.col + 0.5) * cellSize - diameter / 2 : 0;
  const ringY = hoveredCell ? (hoveredCell.row + 0.5) * cellSize - diameter / 2 : 0;

  return (
    <div className="canvas-stack" style={{ width: gridW * cellSize, height: gridH * cellSize }}>
      <HillshadeLayer cellSize={cellSize} />
      <GridCanvas speciesColors={speciesColors} cellSize={cellSize} />
      <BrushCursorLayer speciesColors={speciesColors} cellSize={cellSize} />
      <YearHUD />
      {hoveredCell && (
        <div
          className="brush-ring"
          style={{
            width: diameter,
            height: diameter,
            transform: `translate(${ringX}px, ${ringY}px)`,
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
            transform: `translate(${(hoveredCell.col + 0.5) * cellSize - 8}px, ${(hoveredCell.row + 0.5) * cellSize - 8}px)`,
          }}
        >
          <line x1={3} y1={3} x2={13} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
          <line x1={13} y1={3} x2={3} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
