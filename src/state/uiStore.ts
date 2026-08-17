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
  /** When true, OccurrenceLayer overlays real survey detections (cumulative
   * to the current year, with this year's new ones highlighted) on the map.
   * Independent of historicalMode — a reference layer, not a simulation
   * behavior. Default false. */
  showOccurrences: boolean;
  setTool: (tool: Tool) => void;
  setSelectedSpecies: (idx: number) => void;
  setBrushRadius: (radius: number) => void;
  setHoveredCell: (cell: HoveredCell | null) => void;
  toggleSpeciesVisibility: (idx: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setHistoricalMode: (on: boolean) => void;
  setShowOccurrences: (on: boolean) => void;
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
  showOccurrences: false,
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
  setShowOccurrences: (on) => set({ showOccurrences: on }),
}));
