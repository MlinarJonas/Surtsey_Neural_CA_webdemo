import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";
import { placeholderDiffusionModel } from "./placeholderModel";
import type { GridContext, NCAModel, SimState } from "./types";

export interface AbundancePoint {
  step: number;
  /** Sum of biotic values over land cells, per species (parallel to speciesNames). */
  abundance: number[];
  /** Count of land cells with biotic > OCCUPIED_THRESHOLD, per species. */
  extent: number[];
  /** Sum of each abiotic channel's value over that species' occupied cells
   * (species-major, channel-minor) — divide by extent[s] for the mean. */
  abioticSum: number[][];
}

/** A cell counts as "occupied" by a species above this biotic value. Set well
 * above a bare-presence cutoff so extent tracks established range rather than
 * the faint, broad low-value halo the model leaves almost everywhere. */
const OCCUPIED_THRESHOLD = 0.5;

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

  /** Single pass over land cells computing, per species: the occupied-cell
   * count (extent) and the sum of each abiotic channel's value over those
   * occupied cells (abioticSum — divide by extent for the mean). Combined
   * into one loop rather than separate passes since both are needed together
   * for every history point. */
  private computeExtentAndAbioticSum(state: SimState): { extent: number[]; abioticSum: number[][] } {
    const { landMask, abiotic } = gridStore;
    const extent = state.biotic.map(() => 0);
    const abioticSum = state.biotic.map(() => abiotic.map(() => 0));
    for (let i = 0; i < landMask.length; i++) {
      if (landMask[i] !== 1) continue;
      for (let s = 0; s < state.biotic.length; s++) {
        if (state.biotic[s][i] <= OCCUPIED_THRESHOLD) continue;
        extent[s]++;
        for (let c = 0; c < abiotic.length; c++) abioticSum[s][c] += abiotic[c][i];
      }
    }
    return { extent, abioticSum };
  }

  /** In Historical mode, zeroes any species not yet introduced (real schedule
   * or a manual paint, whichever came first — see gridStore.manuallyActivated)
   * and injects that year's scheduled events at full value, single-cell (no
   * positional-uncertainty blur, unlike the Python training pipeline — this
   * is a display of the actual recorded coordinate, not a training signal).
   * A no-op, returning state unchanged, whenever Historical mode is off. */
  private applyIntroductions(state: SimState, year: number): SimState {
    if (!useUIStore.getState().historicalMode) return state;
    const biotic = state.biotic.map((ch) => ch.slice());
    for (let s = 0; s < biotic.length; s++) {
      const introYear = gridStore.firstIntroductionYear[s];
      const active = (introYear !== undefined && introYear <= year) || gridStore.manuallyActivated[s];
      if (!active) biotic[s].fill(0);
    }
    const events = gridStore.introductionsByYear.get(year);
    if (events) {
      for (const { species, row, col } of events) {
        const idx = row * gridStore.gridW + col;
        if (gridStore.landMask[idx] === 1) biotic[species][idx] = 1.0;
      }
    }
    return { biotic, detectionHistory: state.detectionHistory };
  }

  /** Takes the "reset point" snapshot and seeds history[0] the first time a
   * run/step starts after a reset/clear. No-op on subsequent calls. Applies
   * year-start introductions first (if any), so the reset point itself
   * already reflects them and "Reset" restores correctly. */
  private ensureStarted(): void {
    if (gridStore.hasInitialSnapshot) return;
    // getSimState() returns a fresh wrapper object each call (even though the
    // underlying arrays are shared) — capture it once so the reference
    // comparison below actually detects whether applyIntroductions changed
    // anything, rather than always seeing "different objects."
    const current = gridStore.getSimState();
    const seeded = this.applyIntroductions(current, gridStore.yearStart);
    if (seeded !== current) gridStore.setSimState(seeded);
    gridStore.snapshotInitialCondition();
    const state = gridStore.getSimState();
    const { extent, abioticSum } = this.computeExtentAndAbioticSum(state);
    this.history = [{ step: 0, abundance: this.computeAbundance(state), extent, abioticSum }];
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
      const year = gridStore.yearStart + this.stepCount;
      gridStore.setYear(year);
      const injected = this.applyIntroductions(next, year);
      if (injected !== next) gridStore.setSimState(injected);
      const { extent, abioticSum } = this.computeExtentAndAbioticSum(injected);
      this.history.push({ step: this.stepCount, abundance: this.computeAbundance(injected), extent, abioticSum });
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
