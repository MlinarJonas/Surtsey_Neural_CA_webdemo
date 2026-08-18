import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";
import { gaussianImpulsePeak, repeatedGaussianBlurZero } from "./conv";
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
  /** Sub-steps per simulated year for the active model (see NCAModel.stepsPerYear).
   * 1 whenever no model has been selected yet. */
  stepsPerYear: number;
  speedSubStepsPerSec: number;
  /** Empty string whenever no model has been selected yet — the app only
   * renders playback UI after App.tsx has already called setModel() with a
   * loaded trained model, so this is only user-visible transiently, if ever. */
  modelId: string;
  /** See NCAModel.requiresHistoricalMode. False whenever no model has been
   * selected yet. */
  requiresHistoricalMode: boolean;
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
  /** Null until App.tsx's load effect calls setModel() with a fetched trained
   * model — there is no placeholder/fallback model, so playback is simply
   * unavailable (step()/run() no-op) until a real model has loaded. */
  private model: NCAModel | null = null;
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

  constructor() {
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
   * and injects that year's scheduled events exactly as run_prediction.py /
   * training do: all of a species' events for the year are combined into one
   * 0/1 mask, blurred by the active model's introductionBlurSteps (zero-padded
   * 3x3 Gaussian, matching src/nca/utils.py's blur_field — positional-
   * uncertainty spread, not the replicate padding perceive()/proximity use),
   * renormalized so an isolated point still peaks at 1.0, and merged into
   * biotic via elementwise max (so landing inside an already-occupied area
   * never erases it). With introductionBlurSteps 0 or undefined (e.g. the
   * placeholder model) this degenerates to the old hard single-cell set. A
   * no-op, returning state unchanged, whenever Historical mode is off. */
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
      const { gridH, gridW } = gridStore;
      const bySpecies = new Map<number, Array<{ row: number; col: number }>>();
      for (const { species, row, col } of events) {
        const cells = bySpecies.get(species);
        if (cells) cells.push({ row, col });
        else bySpecies.set(species, [{ row, col }]);
      }
      const blurSteps = this.model?.introductionBlurSteps ?? 0;
      const peak = gaussianImpulsePeak(blurSteps);
      for (const [species, cells] of bySpecies) {
        const mask = new Float32Array(gridH * gridW);
        for (const { row, col } of cells) mask[row * gridW + col] = 1.0;
        const field = repeatedGaussianBlurZero(mask, gridH, gridW, blurSteps);
        const target = biotic[species];
        for (let i = 0; i < field.length; i++) {
          let v = field[i] / peak;
          if (v < 0) v = 0;
          else if (v > 1) v = 1;
          if (v > target[i]) target[i] = v;
        }
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
    this.applyDetHistory(gridStore.yearStart);
    gridStore.snapshotInitialCondition();
    const state = gridStore.getSimState();
    const { extent, abioticSum } = this.computeExtentAndAbioticSum(state);
    this.history = [{ step: 0, abundance: this.computeAbundance(state), extent, abioticSum }];
  }

  /** Swaps in the active model's precomputed real detection-history field for
   * the given year, if it has one (NCAModel.getDetHistoryForYear) — a no-op
   * for models without one, which leaves gridStore.detectionHistory exactly
   * as step() last returned it (all-zero passthrough, for models that ignore
   * the channel entirely). */
  private applyDetHistory(year: number): void {
    const detHist = this.model?.getDetHistoryForYear?.(year);
    if (detHist) gridStore.detectionHistory = detHist;
  }

  /** Runs exactly one model.step() (one sub-step), using the current year's
   * context (held fixed all through that year). Advances to the next year —
   * and only then swaps land_mask/abiotic — once stepsPerYear sub-steps have
   * accumulated. */
  private advanceSubStep(): void {
    const model = this.model;
    if (!model) return; // ticker only ever starts once step()/run() confirmed a model is loaded
    const next = model.step(gridStore.getSimState(), this.ctx());
    gridStore.setSimState(next); // notify() -> canvas redraws this sub-step's frame
    this.subStep++;
    if (this.subStep >= model.stepsPerYear) {
      this.subStep = 0;
      this.stepCount++;
      const year = gridStore.yearStart + this.stepCount;
      gridStore.setYear(year);
      const injected = this.applyIntroductions(next, year);
      if (injected !== next) gridStore.setSimState(injected);
      // Must run AFTER setSimState above — setSimState overwrites
      // detectionHistory wholesale (it passes SimState.detectionHistory
      // through unchanged from before this substep), which would clobber
      // this year's freshly looked-up value if applied first.
      this.applyDetHistory(year);
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
    if (this.mode !== "idle" || !this.model) return;
    this.ensureStarted();
    this.startTicker("stepping");
    this.notify();
  }

  run(): void {
    if (this.mode !== "idle" || !this.model) return;
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
   * rule from the same starting point," not "wipe the canvas." Forces
   * Historical mode on when the new model requires it (PlaybackControls
   * disables the Sandbox button for the same reason, so the user can't
   * switch back out while it's active) — never forces it back off when
   * switching to a model that doesn't require it, so the user's own choice
   * of mode survives an unrelated model switch. */
  setModel(model: NCAModel): void {
    this.pause();
    this.model = model;
    this.stepCount = 0;
    this.subStep = 0;
    gridStore.setYear(gridStore.yearStart);
    gridStore.clearInitialSnapshot();
    this.history = [];
    if (model.requiresHistoricalMode) useUIStore.getState().setHistoricalMode(true);
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
      stepsPerYear: this.model?.stepsPerYear ?? 1,
      speedSubStepsPerSec: this.speedSubStepsPerSec,
      modelId: this.model?.id ?? "",
      requiresHistoricalMode: this.model?.requiresHistoricalMode ?? false,
      history: this.history,
    };
  }

  private notify(): void {
    this.snapshotCache = this.buildSnapshot();
    for (const l of this.listeners) l();
  }
}

/** Singleton — model starts unset; App.tsx's load effect calls setModel()
 * once a trained model has been fetched. */
export const simulationEngine = new SimulationEngine();
