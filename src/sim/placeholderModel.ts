import type { GridContext, NCAModel, SimState } from "./types";

/**
 * PLACEHOLDER — not an ecological model, not the trained Neural Landscape.
 *
 * Each species channel relaxes 30% of the way toward the average of its
 * land-neighbours every step (plain diffusion), clamped to land cells and
 * [0, 1]. No growth, dispersal kernel, or competition — this exists only to
 * prove the simulation engine (reset/step/run/pause) and the model-swap
 * interface before the real trained model is ported in.
 */
export const placeholderDiffusionModel: NCAModel = {
  id: "placeholder-diffusion",
  isPlaceholder: true,
  stepsPerYear: 1,

  step(state: SimState, ctx: GridContext): SimState {
    const { gridH, gridW, landMask } = ctx;
    const nextBiotic = state.biotic.map((channel) => {
      const next = new Float32Array(channel.length);
      for (let row = 0; row < gridH; row++) {
        for (let col = 0; col < gridW; col++) {
          const idx = row * gridW + col;
          if (landMask[idx] !== 1) continue; // ocean stays 0

          let sum = 0;
          let count = 0;
          const neighborRC: Array<[number, number]> = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1],
          ];
          for (const [nr, nc] of neighborRC) {
            if (nr < 0 || nr >= gridH || nc < 0 || nc >= gridW) continue;
            const nIdx = nr * gridW + nc;
            if (landMask[nIdx] !== 1) continue;
            sum += channel[nIdx];
            count++;
          }
          const neighborAvg = count > 0 ? sum / count : 0;
          const value = channel[idx] + 0.3 * (neighborAvg - channel[idx]);
          next[idx] = Math.min(1, Math.max(0, value));
        }
      }
      return next;
    });

    // Pass detectionHistory through untouched — the placeholder has no use
    // for it, but the real model's callers must maintain it, so the shape
    // needs to survive a round trip through step() unchanged.
    return { biotic: nextBiotic, detectionHistory: state.detectionHistory };
  },
};
