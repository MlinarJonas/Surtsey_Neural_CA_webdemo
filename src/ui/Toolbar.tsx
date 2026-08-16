import { gridStore } from "../state/gridStore";
import { simulationEngine } from "../sim/engine";
import { useUIStore } from "../state/uiStore";
import { PaintIcon, EraseIcon } from "./icons";

function handleClear(): void {
  gridStore.reset();
  simulationEngine.stopForClear();
}

export function Toolbar() {
  const tool = useUIStore((s) => s.tool);
  const setTool = useUIStore((s) => s.setTool);
  const brushRadius = useUIStore((s) => s.brushRadius);
  const setBrushRadius = useUIStore((s) => s.setBrushRadius);

  return (
    <div className="toolbar">
      <h2>Tool</h2>
      <div className="tool-group" role="group" aria-label="Paint or erase">
        <button
          type="button"
          className={tool === "paint" ? "selected" : ""}
          aria-pressed={tool === "paint"}
          onClick={() => setTool("paint")}
        >
          <PaintIcon />
          Paint
        </button>
        <button
          type="button"
          className={tool === "erase" ? "selected" : ""}
          aria-pressed={tool === "erase"}
          onClick={() => setTool("erase")}
        >
          <EraseIcon />
          Erase
        </button>
      </div>

      <label className="brush-size">
        Brush size
        <input
          type="range"
          min={0}
          max={5}
          value={brushRadius}
          onChange={(e) => setBrushRadius(Number(e.target.value))}
        />
        <span>{brushRadius}</span>
      </label>

      <button type="button" className="reset-button" onClick={handleClear}>
        Clear island
      </button>
    </div>
  );
}
