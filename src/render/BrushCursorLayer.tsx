import { useEffect, useRef } from "react";
import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";

interface BrushCursorLayerProps {
  /** Hex colors, parallel to gridStore.speciesNames. */
  speciesColors: string[];
}

const CURSOR_ALPHA = 0.35;
// Matches --danger in index.css — canvas fills need a numeric RGB, not a CSS var.
const DANGER_RGB: readonly [number, number, number] = [255, 107, 107];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Ghost preview of the brush: tints the exact cells paint()/erase() would
 * affect, using gridStore.forEachCellInBrush so the preview can never drift
 * from actual behavior. Purely visual — pointer-events:none; GridCanvas
 * (stacked beneath) keeps handling all pointer interaction.
 */
export function BrushCursorLayer({ speciesColors }: BrushCursorLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredCell = useUIStore((s) => s.hoveredCell);
  const tool = useUIStore((s) => s.tool);
  const selectedSpecies = useUIStore((s) => s.selectedSpecies);
  const brushRadius = useUIStore((s) => s.brushRadius);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridStore.isReady()) return;

    const { gridH, gridW } = gridStore;
    canvas.width = gridW;
    canvas.height = gridH;
    // Display size is CSS-driven — see GridCanvas's equivalent comment.

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, gridW, gridH); // always clear first — handles "mouse left canvas" too

    if (!hoveredCell) return;

    const [cr, cg, cb] =
      tool === "erase" ? DANGER_RGB : hexToRgb(speciesColors[selectedSpecies] ?? "#ffffff");
    const imageData = ctx.createImageData(gridW, gridH); // zero-initialized: fully transparent
    const data = imageData.data;
    gridStore.forEachCellInBrush(hoveredCell.row, hoveredCell.col, brushRadius, (idx) => {
      const o = idx * 4;
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = Math.round(CURSOR_ALPHA * 255);
    });
    ctx.putImageData(imageData, 0, 0);
  }, [hoveredCell, tool, selectedSpecies, brushRadius, speciesColors]);

  return <canvas ref={canvasRef} className="brush-cursor-canvas" />;
}
