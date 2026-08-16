import { useEffect, useRef } from "react";
import { gridStore } from "../state/gridStore";

/**
 * Static terrain relief backdrop, drawn once from gridStore.hillshade
 * (computed offline from the real 1967 DEM) and never redrawn — unlike
 * GridCanvas, nothing about this layer changes during a run. Deliberately
 * not pixelated: smoothly interpolated when scaled up, so the crisp species
 * cells drawn above it read against naturally-shaded terrain rather than a
 * second blocky layer.
 */
export function HillshadeLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridStore.isReady()) return;

    const { hillshadeW: w, hillshadeH: h, hillshade } = gridStore;
    canvas.width = w; // native resolution — may exceed gridW/gridH (e.g. the 2m DEM)
    canvas.height = h;
    // Display size is CSS-driven (.canvas-stack canvas { width:100%; height:100% }),
    // independent of native resolution — the browser smoothly scales a
    // higher-res source down to fit, which is the point: crisper apparent
    // detail than a source natively at the model grid's resolution.

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < hillshade.length; i++) {
      const v = hillshade[i];
      const o = i * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  return <canvas ref={canvasRef} className="hillshade-canvas" />;
}
