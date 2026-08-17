import { create } from "zustand";

export type Tool = "paint" | "erase";
export type RenderMode = "blend" | "dominant";

export interface HoveredCell {
  row: number;
  col: number;
}

interface UIState {
  tool: Tool;
  selectedSpecies: number;
  brushRadius: number;
  hoveredCell: HoveredCell | null;
  /** Species indices excluded from rendering. Empty = everything visible. */
  hiddenSpecies: Set<number>;
  renderMode: RenderMode;
  /** When true, the simulation engine auto-introduces species from the real
   * occurrence-CSV schedule at their historical year/location, in addition
   * to whatever the brush paints. Default false — Sandbox (manual painting
   * only) is unchanged. */
  historicalMode: boolean;
  /** When true, OccurrenceLayer overlays real survey detections from every
   * year up to and including the current one. Independent of
   * showOccurrencesCurrentYear and of historicalMode — a reference layer,
   * not a simulation behavior. Default false. */
  showOccurrencesCumulative: boolean;
  /** When true, OccurrenceLayer overlays just the current year's real survey
   * detections, with a highlight ring. Independent of
   * showOccurrencesCumulative — toggle this alone to see only what's new
   * this year, or alongside cumulative to make this year's points stand out
   * against the full history. Default false. */
  showOccurrencesCurrentYear: boolean;
  setTool: (tool: Tool) => void;
  setSelectedSpecies: (idx: number) => void;
  setBrushRadius: (radius: number) => void;
  setHoveredCell: (cell: HoveredCell | null) => void;
  toggleSpeciesVisibility: (idx: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setHistoricalMode: (on: boolean) => void;
  setShowOccurrencesCumulative: (on: boolean) => void;
  setShowOccurrencesCurrentYear: (on: boolean) => void;
}

/** UI-only state (selected tool/species/brush size, hovered cell, layer
 * visibility, render mode) — separate from grid data in gridStore.ts, which
 * never goes through React. */
export const useUIStore = create<UIState>((set) => ({
  tool: "paint",
  selectedSpecies: 0,
  brushRadius: 1,
  hoveredCell: null,
  hiddenSpecies: new Set(),
  renderMode: "blend",
  historicalMode: false,
  showOccurrencesCumulative: false,
  showOccurrencesCurrentYear: false,
  setTool: (tool) => set({ tool }),
  setSelectedSpecies: (idx) => set({ selectedSpecies: idx }),
  setBrushRadius: (radius) => set({ brushRadius: radius }),
  setHoveredCell: (cell) =>
    set((state) => {
      if (state.hoveredCell?.row === cell?.row && state.hoveredCell?.col === cell?.col) {
        return state; // no-op: avoids a re-render on every pixel of mouse movement
      }
      return { hoveredCell: cell };
    }),
  toggleSpeciesVisibility: (idx) =>
    set((state) => {
      const next = new Set(state.hiddenSpecies);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { hiddenSpecies: next };
    }),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setHistoricalMode: (on) => set({ historicalMode: on }),
  setShowOccurrencesCumulative: (on) => set({ showOccurrencesCumulative: on }),
  setShowOccurrencesCurrentYear: (on) => set({ showOccurrencesCurrentYear: on }),
}));
