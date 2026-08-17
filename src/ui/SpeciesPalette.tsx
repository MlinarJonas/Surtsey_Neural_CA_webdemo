import { gridStore } from "../state/gridStore";
import { useUIStore } from "../state/uiStore";

interface SpeciesPaletteProps {
  speciesNames: string[];
  speciesColors: string[];
}

export function SpeciesPalette({ speciesNames, speciesColors }: SpeciesPaletteProps) {
  const selected = useUIStore((s) => s.selectedSpecies);
  const setSelectedSpecies = useUIStore((s) => s.setSelectedSpecies);
  const hiddenSpecies = useUIStore((s) => s.hiddenSpecies);
  const toggleSpeciesVisibility = useUIStore((s) => s.toggleSpeciesVisibility);
  const renderMode = useUIStore((s) => s.renderMode);
  const setRenderMode = useUIStore((s) => s.setRenderMode);
  const showOccurrences = useUIStore((s) => s.showOccurrences);
  const setShowOccurrences = useUIStore((s) => s.setShowOccurrences);

  return (
    <div className="species-palette">
      <h2>Species</h2>

      <div className="tool-group" role="group" aria-label="Layer render mode">
        <button
          type="button"
          className={renderMode === "blend" ? "selected" : ""}
          aria-pressed={renderMode === "blend"}
          onClick={() => setRenderMode("blend")}
        >
          Blend
        </button>
        <button
          type="button"
          className={renderMode === "dominant" ? "selected" : ""}
          aria-pressed={renderMode === "dominant"}
          onClick={() => setRenderMode("dominant")}
        >
          Dominant
        </button>
      </div>

      <ul>
        {speciesNames.map((name, i) => {
          const hidden = hiddenSpecies.has(i);
          return (
            <li key={name} className="species-row">
              <button
                type="button"
                className={i === selected ? "species-button selected" : "species-button"}
                onClick={() => setSelectedSpecies(i)}
                aria-pressed={i === selected}
              >
                <span className="swatch" style={{ backgroundColor: speciesColors[i] }} />
                <span className="species-name">{name}</span>
              </button>
              <label
                className="visibility-toggle"
                title={hidden ? "Show this species' layer" : "Hide this species' layer"}
              >
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={() => toggleSpeciesVisibility(i)}
                />
              </label>
            </li>
          );
        })}
      </ul>

      {/* Only bundles with a real survey record (Surtsey) offer this —
       * gridStore.occurrences is set once at init() and never changes, so a
       * plain read (not a subscribed hook) is enough, same convention as the
       * Historical-mode toggle in PlaybackControls. */}
      {gridStore.occurrences.length > 0 && (
        <label className="occurrence-toggle">
          <input
            type="checkbox"
            checked={showOccurrences}
            onChange={(e) => setShowOccurrences(e.target.checked)}
          />
          Show real occurrences
        </label>
      )}
    </div>
  );
}
