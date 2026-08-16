import { gridStore } from "../state/gridStore";
import { placeholderDiffusionModel } from "./placeholderModel";
import type { GridContext, NCAModel, SimState } from "./types";

export interface AbundancePoint {
  step: number;
  /** Sum of biotic values over land cells, per species (parallel to speciesNames). */
  abundance: number[];
}

export interface EngineSnapshot {
  /** True only during continuous Play — a single Step's own animation does not
   * set this, so the Play/Pause button never flickers mid-step. */
  isRunning: boolean;
  /** True while a single Step's sub-step animation is in progress. Mutually
   * exclusive with isRunning; both false means idle. */
  isStepping: boolean;
  /** Full simulated years elapsed. */
  stepCount: number;
  /** Position within the current year's sub-step animation, 0..stepsPerYear-1. */
  subStep: number;
  /** Sub-steps per simulated year for the active model (see NCAModel.stepsPerYear). */
  stepsPerYear: number;
  speedSubStepsPerSec: number;
  modelId: string;
  isPlaceholder: boolean;
  history: AbundancePoint[];
}

type Mode = "idle" | "playing" | "stepping";
type Listener = () => void;

/**
 * Drives an NCAModel over gridStore's live state. Deliberately separate from
 * rendering (GridCanvas) and from grid data ownership (gridStore) — this
 * class only owns playback timing/meta-state (mode, stepCount, subStep, speed).
 *
 * One simulated year is model.stepsPerYear consecutive model.step() calls with
 * GridContext (land mask, abiotic) held fixed across all of them — matching how
 * the reference Python pipeline actually rolls the model forward (every rollout
 * loop in run_training.py / run_evaluation.py loops nca_steps_per_interval times
 * per snapshot before advancing to the next year's context). Both Play and Step
 * animate every sub-step rather than jumping straight to the year's end state.
 */
class SimulationEngine {
  private model: NCAModel;
  private mode: Mode = "idle";
  private stepCount = 0;
  private subStep = 0;
  private speedSubStepsPerSec = 2;
  private tickerHandle: number | null = null;
  private listeners = new Set<Listener>();
  private snapshotCache: EngineSnapshot;
  /** History is tied to actual simulated years only — never to paint/erase
   * edits, and never to individual sub-steps within a year. */
  private history: AbundancePoint[] = [];

  constructor(model: NCAModel) {
    this.model = model;
    this.snapshotCache = this.buildSnapshot();
  }

  private ctx(): GridContext {
    return {
      gridH: gridStore.gridH,
      gridW: gridStore.gridW,
      landMask: gridStore.landMask,
      abiotic: gridStore.abiotic,
    };
  }

  private computeAbundance(state: SimState): number[] {
    const { landMask } = gridStore;
    return state.biotic.map((channel) => {
      let sum = 0;
      for (let i = 0; i < channel.length; i++) {
        if (landMask[i] === 1) sum += channel[i];
      }
      return sum;
    });
  }

  /** Takes the "reset point" snapshot and seeds history[0] the first time a
   * run/step starts after a reset/clear. No-op on subsequent calls. */
  private ensureStarted(): void {
    if (gridStore.hasInitialSnapshot) return;
    gridStore.snapshotInitialCondition();
    this.history = [{ step: 0, abundance: this.computeAbundance(gridStore.getSimState()) }];
  }

  /** Runs exactly one model.step() (one sub-step), using the current year's
   * context (held fixed all through that year). Advances to the next year —
   * and only then swaps land_mask/abiotic — once stepsPerYear sub-steps have
   * accumulated. */
  private advanceSubStep(): void {
    const next = this.model.step(gridStore.getSimState(), this.ctx());
    gridStore.setSimState(next); // notify() -> canvas redraws this sub-step's frame
    this.subStep++;
    if (this.subStep >= this.model.stepsPerYear) {
      this.subStep = 0;
      this.stepCount++;
      gridStore.setYear(gridStore.yearStart + this.stepCount);
      this.history.push({ step: this.stepCount, abundance: this.computeAbundance(next) });
      if (this.mode === "stepping") {
        this.stopTicker();
        this.mode = "idle";
      }
    }
    this.notify();
  }

  private startTicker(mode: "playing" | "stepping"): void {
    this.stopTicker();
    this.mode = mode;
    const delayMs = 1000 / this.speedSubStepsPerSec;
    this.tickerHandle = window.setInterval(() => this.advanceSubStep(), delayMs);
  }

  private stopTicker(): void {
    if (this.tickerHandle !== null) {
      window.clearInterval(this.tickerHandle);
      this.tickerHandle = null;
    }
  }

  /** Animates one full simulated year (all of the active model's sub-steps),
   * taking the "reset point" snapshot first if none exists yet. No-op while
   * already running or mid-step. */
  step(): void {
    if (this.mode !== "idle") return;
    this.ensureStarted();
    this.startTicker("stepping");
    this.notify();
  }

  run(): void {
    if (this.mode !== "idle") return;
    this.ensureStarted();
    this.startTicker("playing");
    this.notify();
  }

  pause(): void {
    if (this.mode === "idle") return;
    this.stopTicker();
    this.mode = "idle";
    this.notify();
  }

  /** Stops playback and restores the state (and year) captured at the last step()/run(). */
  reset(): void {
    this.pause();
    if (gridStore.hasInitialSnapshot) gridStore.restoreInitialCondition();
    this.stepCount = 0;
    this.subStep = 0;
    gridStore.setYear(gridStore.yearStart);
    this.history = this.history.length > 0 ? [this.history[0]] : [];
    this.notify();
  }

  /** Stops playback, zeroes the step counter and year, and drops all history
   * — for when the user clears the island entirely via gridStore.reset(). */
  stopForClear(): void {
    this.pause();
    this.stepCount = 0;
    this.subStep = 0;
    gridStore.setYear(gridStore.yearStart);
    this.history = [];
    this.notify();
  }

  /** Switches the active model. Pauses playback and starts a fresh run (step
   * counter, sub-step, history, and year all reset) but deliberately keeps
   * whatever is currently painted — "restart the simulation using a different
   * rule from the same starting point," not "wipe the canvas." */
  setModel(model: NCAModel): void {
    this.pause();
    this.model = model;
    this.stepCount = 0;
    this.subStep = 0;
    gridStore.setYear(gridStore.yearStart);
    gridStore.clearInitialSnapshot();
    this.history = [];
    this.notify();
  }

  setSpeed(subStepsPerSecond: number): void {
    this.speedSubStepsPerSec = Math.max(0.5, subStepsPerSecond);
    const mode = this.mode;
    if (mode !== "idle") this.startTicker(mode); // restart ticker at the new interval, same mode
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshotCache;
  }

  private buildSnapshot(): EngineSnapshot {
    return {
      isRunning: this.mode === "playing",
      isStepping: this.mode === "stepping",
      stepCount: this.stepCount,
      subStep: this.subStep,
      stepsPerYear: this.model.stepsPerYear,
      speedSubStepsPerSec: this.speedSubStepsPerSec,
      modelId: this.model.id,
      isPlaceholder: this.model.isPlaceholder,
      history: this.history,
    };
  }

  private notify(): void {
    this.snapshotCache = this.buildSnapshot();
    for (const l of this.listeners) l();
  }
}

/** Singleton — swap placeholderDiffusionModel for the real ported model here later. */
export const simulationEngine = new SimulationEngine(placeholderDiffusionModel);
