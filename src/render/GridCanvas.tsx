import { useEffect, useRef } from "react";
import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";

interface GridCanvasProps {
  /** Hex colors, parallel to gridStore.speciesNames. */
  speciesColors: string[];
}

// Deep ocean blue — deliberately distinct from every species hue in the
// categorical palette. Land has no fill of its own any more: unpainted land
// is fully transparent so the HillshadeLayer beneath shows through, and
// painted species composite over it via Porter-Duff "over" (see compositeOver).
const OCEAN_RGB: readonly [number, number, number] = [27, 52, 84];

/** How long an erased cell's ghost value takes to fade to zero, purely as a
 * rendering effect — gridStore.erase() itself stays instant/synchronous. */
const FADE_DURATION_MS = 400;

interface FadeEntry {
  cellIdx: number;
  species: number;
  /** Biotic value the instant before erase() zeroed it — the fade's starting point. */
  value: number;
  startTime: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Porter-Duff "over": composites a source (cr,cg,cb,alpha) onto an
 * accumulated destination (dr,dg,db,dAlpha), returning the new accumulated
 * (color, alpha), all in [0,1] except the 8-bit color channels. Reduces
 * exactly to the old flat alpha lerp when dAlpha=1 (the ocean case, always
 * opaque) — this is a strict generalization, needed now that land cells
 * start fully transparent instead of an opaque flat fill.
 */
function compositeOver(
  dr: number, dg: number, db: number, dAlpha: number,
  cr: number, cg: number, cb: number, alpha: number
): [number, number, number, number] {
  const outAlpha = alpha + dAlpha * (1 - alpha);
  if (outAlpha <= 0) return [0, 0, 0, 0];
  const carry = dAlpha * (1 - alpha);
  return [
    (cr * alpha + dr * carry) / outAlpha,
    (cg * alpha + dg * carry) / outAlpha,
    (cb * alpha + db * carry) / outAlpha,
    outAlpha,
  ];
}

export function GridCanvas({ speciesColors }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read reactively (not via getState()) — a layer/mode toggle should redraw
  // immediately, not wait for the next paint stroke.
  const hiddenSpecies = useUIStore((s) => s.hiddenSpecies);
  const renderMode = useUIStore((s) => s.renderMode);
  // Fade-on-erase state: persists across effect re-runs (unlike the effect's
  // own locals) so an in-flight fade survives a hiddenSpecies/renderMode change.
  const fadeTrackerRef = useRef<Map<string, FadeEntry>>(new Map());
  const fadeRafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridStore.isReady()) return;

    const { gridH, gridW } = gridStore;
    canvas.width = gridW;
    canvas.height = gridH;
    // Display size is CSS-driven (.canvas-stack canvas { width:100%; height:100% })
    // rather than set here — the wrapper's aspect-ratio (see IslandView) is what
    // keeps this proportionally correct at any responsive scale, including on
    // narrow viewports where it must shrink below its native pixel size.

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rgbColors = speciesColors.map(hexToRgb);
    let imageData = ctx.createImageData(gridW, gridH);

    function draw() {
      const { landMask, biotic } = gridStore;
      const data = imageData.data;

      // Computes one cell's composited color. `override` lets the ghost-fade
      // pass below substitute a decaying value for one species at one cell,
      // without duplicating the dominant/blend compositing logic.
      function computeCellColor(
        i: number,
        override?: { species: number; alpha: number }
      ): [number, number, number, number] {
        let r: number, g: number, b: number, a: number;
        if (landMask[i] === 1) {
          // Transparent base — unpainted land shows the hillshade layer
          // beneath at full strength; painted species composite over it.
          r = g = b = a = 0;
        } else {
          [r, g, b] = OCEAN_RGB;
          a = 1;
        }

        // Alpha is the raw biotic value, exactly — no perceptual boost curve.
        // A raw^0.6-style curve was tried and reverted: it renders low
        // suitability values at misleadingly high opacity (e.g. 0.2 true
        // value showing at 36% instead of 20%), which matters for a
        // scientific tool where visual intensity should track the real number.
        const alphaAt = (s: number): number => {
          const trueAlpha = biotic[s][i];
          // max(), not replace: if the cell was repainted while an old fade
          // is still in flight, the fresh (higher) true value wins outright.
          return override && override.species === s ? Math.max(trueAlpha, override.alpha) : trueAlpha;
        };

        if (renderMode === "dominant") {
          // Flat color of whichever visible species has the highest value
          // at this cell, intensity-scaled by that value (not full-opacity
          // regardless of strength — a faint dominant species should still
          // look faint).
          let bestSpecies = -1;
          let bestValue = 0;
          for (let s = 0; s < biotic.length; s++) {
            if (hiddenSpecies.has(s)) continue;
            const v = alphaAt(s);
            if (v > bestValue) {
              bestValue = v;
              bestSpecies = s;
            }
          }
          if (bestSpecies >= 0) {
            const [cr, cg, cb] = rgbColors[bestSpecies];
            [r, g, b, a] = compositeOver(r, g, b, a, cr, cg, cb, bestValue);
          }
        } else {
          for (let s = 0; s < biotic.length; s++) {
            if (hiddenSpecies.has(s)) continue;
            const alpha = alphaAt(s);
            if (alpha <= 0) continue;
            const [cr, cg, cb] = rgbColors[s];
            [r, g, b, a] = compositeOver(r, g, b, a, cr, cg, cb, alpha);
          }
        }
        return [r, g, b, a];
      }

      for (let i = 0; i < gridH * gridW; i++) {
        const [r, g, b, a] = computeCellColor(i);
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = a * 255;
      }

      // Overlay actively-fading (just-erased) cells with their decaying
      // ghost value. A small set compared to the full grid, so this is a
      // second targeted pass rather than a per-cell branch in the main loop.
      if (fadeTrackerRef.current.size > 0) {
        const now = performance.now();
        for (const [key, entry] of fadeTrackerRef.current) {
          const elapsed = now - entry.startTime;
          if (elapsed >= FADE_DURATION_MS) {
            fadeTrackerRef.current.delete(key);
            continue;
          }
          const ghostAlpha = entry.value * (1 - elapsed / FADE_DURATION_MS);
          const [r, g, b, a] = computeCellColor(entry.cellIdx, { species: entry.species, alpha: ghostAlpha });
          const o = entry.cellIdx * 4;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = a * 255;
        }
      }

      ctx!.putImageData(imageData, 0, 0);
    }

    function ensureFadeLoopRunning() {
      if (fadeRafRef.current !== null) return; // already running
      function tick() {
        draw();
        fadeRafRef.current = fadeTrackerRef.current.size > 0 ? requestAnimationFrame(tick) : null;
      }
      fadeRafRef.current = requestAnimationFrame(tick);
    }

    draw();
    const unsubscribeDraw = gridStore.subscribe(draw);
    // Resume any fade left in-flight across an effect re-run (e.g. the user
    // toggled a species checkbox mid-fade) — the tracker itself persists
    // (it's a ref), but the previous effect run's RAF loop was cancelled.
    if (fadeTrackerRef.current.size > 0) ensureFadeLoopRunning();

    // --- Pointer handling: paint/erase while dragging, land cells only ---
    let painting = false;

    function cellFromEvent(e: PointerEvent): { row: number; col: number } {
      const rect = canvas!.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * gridW);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * gridH);
      return { row, col };
    }

    function applyAt(e: PointerEvent) {
      const { row, col } = cellFromEvent(e);
      const { tool, selectedSpecies, brushRadius } = useUIStore.getState();
      if (tool === "paint") {
        gridStore.paint(selectedSpecies, row, col, brushRadius);
        return;
      }
      // Snapshot pre-erase values before erase() zeroes them, so the ghost
      // fade has a starting point — erase() itself stays instant/synchronous.
      const { biotic } = gridStore;
      const now = performance.now();
      gridStore.forEachCellInBrush(row, col, brushRadius, (idx) => {
        const preErase = biotic[selectedSpecies][idx];
        if (preErase > 0) {
          fadeTrackerRef.current.set(`${selectedSpecies}:${idx}`, {
            cellIdx: idx,
            species: selectedSpecies,
            value: preErase,
            startTime: now,
          });
        }
      });
      gridStore.erase(selectedSpecies, row, col, brushRadius);
      ensureFadeLoopRunning();
    }

    function onPointerDown(e: PointerEvent) {
      painting = true;
      canvas!.setPointerCapture(e.pointerId);
      applyAt(e);
    }
    function onPointerMove(e: PointerEvent) {
      const { row, col } = cellFromEvent(e);
      useUIStore.getState().setHoveredCell({ row, col });
      if (!painting) return;
      applyAt(e);
    }
    function onPointerUp(e: PointerEvent) {
      painting = false;
      canvas!.releasePointerCapture(e.pointerId);
    }
    function onPointerLeaveCanvas(e: PointerEvent) {
      onPointerUp(e);
      useUIStore.getState().setHoveredCell(null);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeaveCanvas);

    return () => {
      unsubscribeDraw();
      if (fadeRafRef.current !== null) cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeaveCanvas);
    };
  }, [speciesColors, hiddenSpecies, renderMode]);

  return <canvas ref={canvasRef} className="grid-canvas" />;
}
