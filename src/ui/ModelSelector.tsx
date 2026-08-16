import { useSyncExternalStore } from "react";
import { simulationEngine } from "../sim/engine";
import type { NCAModel } from "../sim/types";

export interface ModelOption {
  id: string;
  label: string;
  model: NCAModel;
}

interface ModelSelectorProps {
  options: ModelOption[];
}

export function ModelSelector({ options }: ModelSelectorProps) {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );

  if (options.length <= 1) return null; // nothing to choose between

  return (
    <div className="model-selector">
      <h2>Model</h2>
      <select
        value={snapshot.modelId}
        onChange={(e) => {
          const opt = options.find((o) => o.id === e.target.value);
          if (opt) simulationEngine.setModel(opt.model);
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
