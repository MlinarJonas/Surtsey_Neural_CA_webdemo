import { useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import { PlayIcon, PauseIcon, StepIcon, ResetIcon } from "./icons";

export function PlaybackControls() {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  const busy = snapshot.isRunning || snapshot.isStepping;
  const secondsPerYear = snapshot.stepsPerYear / snapshot.speedSubStepsPerSec;

  return (
    <div className="playback-controls">
      <h2>Simulation</h2>
      {snapshot.isPlaceholder && (
        <p className="placeholder-warning">
          Placeholder rule ({snapshot.modelId}) — not the trained ecological model.
        </p>
      )}
      <div className="tool-group" role="group" aria-label="Playback">
        <button type="button" disabled={busy} onClick={() => simulationEngine.step()}>
          <StepIcon />
          Step
        </button>
        {snapshot.isRunning ? (
          <button type="button" onClick={() => simulationEngine.pause()}>
            <PauseIcon />
            Pause
          </button>
        ) : (
          <button type="button" disabled={snapshot.isStepping} onClick={() => simulationEngine.run()}>
            <PlayIcon />
            Play
          </button>
        )}
        <button type="button" onClick={() => simulationEngine.reset()}>
          <ResetIcon />
          Reset
        </button>
      </div>

      <label className="brush-size">
        Speed (sub-steps/s)
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={snapshot.speedSubStepsPerSec}
          onChange={(e) => simulationEngine.setSpeed(Number(e.target.value))}
        />
        <span>{snapshot.speedSubStepsPerSec}/s</span>
      </label>
      <p className="sub-step-rate">≈ {secondsPerYear.toFixed(1)}s per simulated year</p>

      <p className="step-count">
        {snapshot.stepCount} simulated year{snapshot.stepCount === 1 ? "" : "s"} elapsed
        {busy && ` (sub-step ${snapshot.subStep}/${snapshot.stepsPerYear})`}
      </p>
    </div>
  );
}
