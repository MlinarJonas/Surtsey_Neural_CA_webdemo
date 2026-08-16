import { useSyncExternalStore } from "react";
import { gridStore } from "../state/gridStore";
import { useGridStoreTick } from "../state/useGridStoreTick";
import { simulationEngine } from "../sim/engine";

/**
 * Large, semi-transparent year readout overlaid on the island view — the
 * primary "when am I looking at" signal, replacing the old inline header
 * readout (formerly App.tsx's YearReadout). Includes a thin sub-step
 * progress bar during animation so the stepsPerYear cadence (see engine.ts)
 * reads as "a year is unfolding," not just a paused number.
 */
export function YearHUD() {
  useGridStoreTick();
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const busy = snapshot.isRunning || snapshot.isStepping;
  const progress = snapshot.stepsPerYear > 0 ? snapshot.subStep / snapshot.stepsPerYear : 0;
  const extrapolating = gridStore.currentYear > gridStore.yearEnd;

  return (
    <div className="year-hud">
      <div className="year-hud-value">{gridStore.currentYear}</div>
      <div className="year-hud-range">
        {gridStore.yearStart}–{gridStore.yearEnd}
        {extrapolating && " · beyond data, terrain held at " + gridStore.yearEnd}
      </div>
      {busy && (
        <div className="year-hud-progress">
          <div className="year-hud-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
