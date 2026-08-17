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
  const showOccurrencesCumulative = useUIStore((s) => s.showOccurrencesCumulative);
  const setShowOccurrencesCumulative = useUIStore((s) => s.setShowOccurrencesCumulative);
  const showOccurrencesCurrentYear = useUIStore((s) => s.showOccurrencesCurrentYear);
  const setShowOccurrencesCurrentYear = useUIStore((s) => s.setShowOccurrencesCurrentYear);

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

      {/* Only bundles with a real survey record (Surtsey) offer these —
       * gridStore.occurrences is set once at init() and never changes, so a
       * plain read (not a subscribed hook) is enough, same convention as the
       * Historical-mode toggle in PlaybackControls. Two independent toggles:
       * the full history up to the current year, and just this year's new
       * detections — either can be on alone, or both together to see this
       * year's points stand out against the full record. */}
      {gridStore.occurrences.length > 0 && (
        <div className="occurrence-toggles">
          <label className="occurrence-toggle">
            <input
              type="checkbox"
              checked={showOccurrencesCumulative}
              onChange={(e) => setShowOccurrencesCumulative(e.target.checked)}
            />
            Show occurrences to date
          </label>
          <label className="occurrence-toggle">
            <input
              type="checkbox"
              checked={showOccurrencesCurrentYear}
              onChange={(e) => setShowOccurrencesCurrentYear(e.target.checked)}
            />
            Show this year&apos;s occurrences
          </label>
        </div>
      )}
    </div>
  );
}
