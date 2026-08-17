import type { IntroductionEvent, IslandBundle } from "../manifest/types";

/**
 * Grid/paint/simulation state, deliberately kept outside React.
 *
 * A later stage may drive this same state from a Web Worker running the
 * real NCA step loop at 10-30Hz; React re-renders must never compete with
 * that, so the renderer subscribes directly and redraws imperatively rather
 * than going through React state/props.
 */

/**
 * The data an NCAModel.step() reads and returns. Mirrors the real trained
 * model's forward(state, detection_history) signature (src/nca/nl_model.py)
 * — detectionHistory is threaded through even though the placeholder model
 * ignores it, so swapping in the real ported step() later doesn't require
 * restructuring this shape. Abiotic is deliberately NOT part of SimState: it
 * is externally driven by calendar year (see setYear), never modified by a
 * model, and never snapshotted/restored — resetting the year is enough.
 */
export interface SimState {
  biotic: Float32Array[];
  detectionHistory: Float32Array[];
}

type Listener = () => void;

class GridStore {
  gridH = 0;
  gridW = 0;
  yearStart = 0;
  yearEnd = 0;
  currentYear = 0;
  speciesNames: string[] = [];
  /** Current year's mask, row-major length gridH * gridW. 1 = land, 0 = ocean.
   * Reassigned (not mutated) by setYear() — Surtsey's coastline genuinely
   * eroded 1967-1990, so this is a view into landMaskByYear, not a constant. */
  landMask: Uint8Array = new Uint8Array(0);
  /** Current year's abiotic channels (static + that year's varying channels,
   * normalized [0,1]), in model input order. Reassigned by setYear(). */
  abiotic: Float32Array[] = [];
  /** One Float32Array per species, each row-major length gridH * gridW, values in [0, 1]. */
  biotic: Float32Array[] = [];
  /** One Float32Array per species. Unused by the placeholder model; carried
   * for forward-compatibility with the real model's detection-history input. */
  detectionHistory: Float32Array[] = [];
  /** Hillshade relief computed once from the real 1967 DEM, row-major length
   * hillshadeH * hillshadeW, values 0-255. Static — set once in init(), never
   * reassigned by setYear() (unlike landMask/abiotic, the terrain relief
   * itself doesn't change; only distance-to-shore/land mask do). */
  hillshade: Uint8Array = new Uint8Array(0);
  hillshadeW = 0;
  hillshadeH = 0;
  /** Real-world introduction schedule (empty for bundles with none, e.g. the
   * placeholder/synthetic world) — set once in init(), read by the
   * simulation engine's Historical mode. */
  introductions: IntroductionEvent[] = [];
  /** introductions grouped by year, for O(1) lookup during playback. */
  introductionsByYear: Map<number, IntroductionEvent[]> = new Map();
  /** Per species, the earliest year it appears in introductions — undefined
   * if that species has no scheduled introduction at all. */
  firstIntroductionYear: (number | undefined)[] = [];
  /** Per species, true once the user has hand-painted it at least once —
   * exempts it from Historical mode's "not yet introduced" gate regardless
   * of when the paint happened, so switching modes never retroactively wipes
   * something the user deliberately placed. Reset by reset(). */
  manuallyActivated: boolean[] = [];

  private ready = false;
  private listeners = new Set<Listener>();
  /** landMaskByYear[y] / abioticVaryingByYear[y] are indexed by (year - yearStart). */
  private landMaskByYear: Uint8Array[] = [];
  private abioticStatic: Float32Array[] = [];
  private abioticVaryingByYear: Float32Array[][] = [];
  /** Snapshot of {biotic, detectionHistory} taken the first time the
   * simulation engine steps/runs after a reset — what "Reset" restores to. */
  private initialState: SimState | null = null;

  /**
   * @param landMaskBuf Uint8, shape (nYears, gridH*gridW), year-major.
   * @param abioticStaticBuf Float32, shape (nAbioticStatic, gridH*gridW).
   * @param abioticVaryingBuf Float32, shape (nYears, nAbioticVarying, gridH*gridW), year-major.
   * @param hillshadeBuf Uint8, shape (hillshadeH*hillshadeW,).
   * @param introductions Real-world introduction schedule, if any — empty for
   * bundles without one (e.g. the placeholder/synthetic world).
   */
  init(
    bundle: IslandBundle,
    landMaskBuf: ArrayBuffer,
    abioticStaticBuf: ArrayBuffer,
    abioticVaryingBuf: ArrayBuffer,
    hillshadeBuf: ArrayBuffer,
    introductions: IntroductionEvent[] = []
  ): void {
    this.gridH = bundle.gridH;
    this.gridW = bundle.gridW;
    this.yearStart = bundle.yearStart;
    this.yearEnd = bundle.yearEnd;
    this.speciesNames = bundle.speciesNames;

    this.introductions = introductions;
    this.introductionsByYear = new Map();
    for (const event of introductions) {
      const forYear = this.introductionsByYear.get(event.year);
      if (forYear) forYear.push(event);
      else this.introductionsByYear.set(event.year, [event]);
    }
    this.firstIntroductionYear = bundle.speciesNames.map(() => undefined);
    for (const event of introductions) {
      const cur = this.firstIntroductionYear[event.species];
      if (cur === undefined || event.year < cur) this.firstIntroductionYear[event.species] = event.year;
    }
    this.manuallyActivated = bundle.speciesNames.map(() => false);

    this.hillshadeH = bundle.hillshadeH;
    this.hillshadeW = bundle.hillshadeW;
    this.hillshade = new Uint8Array(hillshadeBuf);
    if (this.hillshade.length !== this.hillshadeH * this.hillshadeW) {
      throw new Error(
        `hillshade.bin size ${this.hillshade.length} does not match manifest ` +
          `hillshadeH*hillshadeW ${this.hillshadeH * this.hillshadeW}`
      );
    }

    const cellsPerYear = bundle.gridH * bundle.gridW;
    const nYears = bundle.yearEnd - bundle.yearStart + 1;

    const landMaskFlat = new Uint8Array(landMaskBuf);
    this.landMaskByYear = Array.from({ length: nYears }, (_, y) =>
      landMaskFlat.subarray(y * cellsPerYear, (y + 1) * cellsPerYear)
    );

    const staticFlat = new Float32Array(abioticStaticBuf);
    this.abioticStatic = Array.from({ length: bundle.nAbioticStatic }, (_, c) =>
      staticFlat.subarray(c * cellsPerYear, (c + 1) * cellsPerYear)
    );

    const varyingFlat = new Float32Array(abioticVaryingBuf);
    const varyingPerYear = bundle.nAbioticVarying * cellsPerYear;
    this.abioticVaryingByYear = Array.from({ length: nYears }, (_, y) =>
      Array.from({ length: bundle.nAbioticVarying }, (_, c) =>
        varyingFlat.subarray(
          y * varyingPerYear + c * cellsPerYear,
          y * varyingPerYear + (c + 1) * cellsPerYear
        )
      )
    );

    this.biotic = bundle.speciesNames.map(() => new Float32Array(cellsPerYear));
    this.detectionHistory = bundle.speciesNames.map(() => new Float32Array(cellsPerYear));

    this.ready = true;
    this.setYear(bundle.yearStart); // also notifies
  }

  isReady(): boolean {
    return this.ready;
  }

  isLand(row: number, col: number): boolean {
    if (row < 0 || row >= this.gridH || col < 0 || col >= this.gridW) return false;
    return this.landMask[row * this.gridW + col] === 1;
  }

  /** Advances the displayed year — uncapped, so the simulation can keep
   * running past yearEnd — while landMask/abiotic freeze at yearEnd's real
   * values once there (there is no real future data to show; holding the
   * last known terrain/coastline steady is the same "no extrapolation of
   * conditions" interpretation the training pipeline itself uses for
   * equilibrium/self-repair testing, see CLAUDE.md's A3.3 section). Below
   * yearStart is defensively clamped the same way, though callers never
   * actually pass a year that low. */
  setYear(year: number): void {
    this.currentYear = year;
    const idx = Math.max(0, Math.min(this.yearEnd - this.yearStart, year - this.yearStart));
    this.landMask = this.landMaskByYear[idx];
    this.abiotic = [...this.abioticStatic, ...this.abioticVaryingByYear[idx]];
    this.notify();
  }

  /** Sets the selected species to full occupancy in a circular brush, land cells only. */
  paint(speciesIdx: number, row: number, col: number, radius: number): void {
    this.forEachCellInBrush(row, col, radius, (idx) => {
      this.biotic[speciesIdx][idx] = 1.0;
    });
    // A hand-painted species is "activated" from now on regardless of the
    // current mode, so switching to Historical mode later never wipes it.
    this.manuallyActivated[speciesIdx] = true;
    this.notify();
  }

  /** Clears the selected species to zero in a circular brush, land cells only. */
  erase(speciesIdx: number, row: number, col: number, radius: number): void {
    this.forEachCellInBrush(row, col, radius, (idx) => {
      this.biotic[speciesIdx][idx] = 0.0;
    });
    this.notify();
  }

  /** Clears every species channel back to an empty island, and discards any
   * simulation snapshot — this is "start a new scenario", not "reset the run". */
  reset(): void {
    for (const channel of this.biotic) channel.fill(0);
    for (const channel of this.detectionHistory) channel.fill(0);
    this.initialState = null;
    this.manuallyActivated = this.manuallyActivated.map(() => false);
    this.notify();
  }

  get hasInitialSnapshot(): boolean {
    return this.initialState !== null;
  }

  /** Drops the reset-point snapshot without touching biotic/detectionHistory —
   * used when switching models mid-session, so "Reset" afterwards captures a
   * fresh snapshot from whatever's currently painted rather than restoring a
   * stale one from before the switch. */
  clearInitialSnapshot(): void {
    this.initialState = null;
  }

  /** Captures the current state as what the simulation's "Reset" restores to. */
  snapshotInitialCondition(): void {
    this.initialState = {
      biotic: this.biotic.map((ch) => ch.slice()),
      detectionHistory: this.detectionHistory.map((ch) => ch.slice()),
    };
  }

  /** Restores {biotic, detectionHistory} to the last captured snapshot, if any. */
  restoreInitialCondition(): void {
    if (!this.initialState) return;
    this.biotic = this.initialState.biotic.map((ch) => ch.slice());
    this.detectionHistory = this.initialState.detectionHistory.map((ch) => ch.slice());
    this.notify();
  }

  getSimState(): SimState {
    return { biotic: this.biotic, detectionHistory: this.detectionHistory };
  }

  setSimState(state: SimState): void {
    this.biotic = state.biotic;
    this.detectionHistory = state.detectionHistory;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Iterates every land cell in a circular brush centered at (row, col).
   * Public so the brush cursor preview (BrushCursorLayer) can compute the
   * exact same affected-cell set paint()/erase() do — the ghost preview can
   * never drift from actual behavior. */
  forEachCellInBrush(
    row: number,
    col: number,
    radius: number,
    fn: (cellIdx: number) => void
  ): void {
    const r2 = radius * radius;
    const rMin = Math.max(0, row - radius);
    const rMax = Math.min(this.gridH - 1, row + radius);
    const cMin = Math.max(0, col - radius);
    const cMax = Math.min(this.gridW - 1, col + radius);
    for (let rr = rMin; rr <= rMax; rr++) {
      for (let cc = cMin; cc <= cMax; cc++) {
        const dr = rr - row;
        const dc = cc - col;
        if (dr * dr + dc * dc > r2) continue;
        if (!this.isLand(rr, cc)) continue;
        fn(rr * this.gridW + cc);
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Singleton — one island, one grid, for the lifetime of the page. */
export const gridStore = new GridStore();
