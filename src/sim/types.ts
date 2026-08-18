import type { SimState } from "../state/gridStore";

export type { SimState };

export interface GridContext {
  gridH: number;
  gridW: number;
  /** Current-year mask, row-major length gridH * gridW. 1 = land, 0 = ocean. */
  landMask: Uint8Array;
  /** Current-year abiotic channels (static + that year's varying channels,
   * normalized [0,1]), in model input order. */
  abiotic: Float32Array[];
}

/**
 * A step function the simulation engine can drive. The real trained model
 * and this stage's placeholder both implement this same interface, so the
 * engine and UI never need to know which one is running.
 */
export interface NCAModel {
  /** Shown in the UI (model dropdown, status banner). */
  readonly id: string;
  /** How many consecutive step() calls make up one simulated year, with the
   * engine holding GridContext (land mask, abiotic) fixed across all of them —
   * matches how the reference Python pipeline actually rolls the model forward
   * (see run_training.py's training/export loops and run_evaluation.py's
   * scenario rollout, all of which loop nca_steps_per_interval times per
   * snapshot before advancing to the next year's context). Not always 1. */
  readonly stepsPerYear: number;
  /** Blur iterations the engine applies to a Historical-mode introduction
   * point before merging it into biotic (see sim/conv.ts's
   * repeatedGaussianBlurZero + gaussianImpulsePeak) — matches
   * src/nca/utils.py's blur_field(), the same seeding run_prediction.py uses.
   * Undefined/0 = no blur, i.e. a hard single-cell set (the placeholder
   * model's implicit default). */
  readonly introductionBlurSteps?: number;
  /** True when this model was trained on a real, growing detection-history
   * signal that only exists along the actual historical timeline — the
   * engine disables Sandbox mode while such a model is active (see
   * getDetHistoryForYear). Undefined/false = no constraint. */
  readonly requiresHistoricalMode?: boolean;
  /** Looks up the precomputed real detection-history field for a given
   * calendar year (one Float32Array per species, [0,1]), or null if this
   * model has none for that year — the engine falls back to leaving
   * SimState.detectionHistory untouched in that case. The real record is
   * fixed by the historical CSV alone (no model state or randomness), so
   * it's a lookup, not something computed live. */
  getDetHistoryForYear?(year: number): Float32Array[] | null;
  /** Computes one update step. Must return a new SimState rather than
   * mutating the input in place — the engine owns snapshot/reset lifecycle. */
  step(state: SimState, ctx: GridContext): SimState;
}
