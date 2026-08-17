import type { MarkerShape } from "./markerShapeTypes";

interface MarkerProps {
  shape: MarkerShape;
  /** Center, in grid-cell units (matches OccurrenceLayer's viewBox). */
  cx: number;
  cy: number;
  /** Roughly the marker's half-width, in grid-cell units. */
  r: number;
  fill: string;
  /** Present (with a visible width) for "new this year"; omitted for older,
   * already-cumulative points. */
  stroke?: string;
  strokeWidth?: number;
}

/** Renders one species-shaped marker at (cx, cy) in the given fill/stroke —
 * a small polygon/circle per shape, all sized off the same r so every shape
 * reads as roughly the same visual weight. */
export function Marker({ shape, cx, cy, r, fill, stroke, strokeWidth }: MarkerProps) {
  const common = { fill, stroke, strokeWidth };
  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={r} {...common} />;
    case "square": {
      const s = r * 1.7;
      return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...common} />;
    }
    case "triangle": {
      const h = r * 1.9;
      const points = `${cx},${cy - h * 0.6} ${cx - h * 0.58},${cy + h * 0.4} ${cx + h * 0.58},${cy + h * 0.4}`;
      return <polygon points={points} {...common} />;
    }
    case "diamond": {
      const s = r * 1.3;
      const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
      return <polygon points={points} {...common} />;
    }
    case "cross": {
      const s = r * 0.9;
      const w = r * 0.55;
      const points = [
        [cx - w, cy - s], [cx + w, cy - s], [cx + w, cy - w],
        [cx + s, cy - w], [cx + s, cy + w], [cx + w, cy + w],
        [cx + w, cy + s], [cx - w, cy + s], [cx - w, cy + w],
        [cx - s, cy + w], [cx - s, cy - w], [cx - w, cy - w],
      ]
        .map(([x, y]) => `${x},${y}`)
        .join(" ");
      return <polygon points={points} {...common} />;
    }
    case "star": {
      const outer = r * 1.3;
      const inner = r * 0.55;
      const points = Array.from({ length: 10 }, (_, i) => {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
      }).join(" ");
      return <polygon points={points} {...common} />;
    }
  }
}
