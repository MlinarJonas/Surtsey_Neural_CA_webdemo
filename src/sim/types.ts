import type { SimState } from "../state/gridStore";

export type { SimState };

export interface GridContext {
  gridH: number;
  gridW: number;
  /** Current-year mask, row-major length gridH * gridW. 1 = land, 0 = ocean. */
  landMask: Uint8Array;
  /** Current-year abiotic channels (static + that year's varying channels,
   * normalized [0,1]), in model input order. Ignored by the placeholder model. */
  abiotic: Float32Array[];
}

/**
 * A step function the simulation engine can drive. The real trained model
 * and this stage's placeholder both implement this same interface, so the
 * engine and UI never need to know which one is running.
 */
export interface NCAModel {
  /** Shown in the UI so a placeholder can never be mistaken for a validated result. */
  readonly id: string;
  readonly isPlaceholder: boolean;
  /** How many consecutive step() calls make up one simulated year, with the
   * engine holding GridContext (land mask, abiotic) fixed across all of them —
   * matches how the reference Python pipeline actually rolls the model forward
   * (see run_training.py's training/export loops and run_evaluation.py's
   * scenario rollout, all of which loop nca_steps_per_interval times per
   * snapshot before advancing to the next year's context). Not always 1. */
  readonly stepsPerYear: number;
  /** Computes one update step. Must return a new SimState rather than
   * mutating the input in place — the engine owns snapshot/reset lifecycle. */
  step(state: SimState, ctx: GridContext): SimState;
}
