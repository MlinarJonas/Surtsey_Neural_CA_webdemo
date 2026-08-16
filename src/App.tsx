import { useEffect, useState, useSyncExternalStore } from "react";
import "./App.css";
import { gridStore } from "./state/gridStore";
import { IslandView } from "./render/IslandView";
import { SpeciesPalette } from "./ui/SpeciesPalette";
import { Toolbar } from "./ui/Toolbar";
import { PlaybackControls } from "./ui/PlaybackControls";
import { CellInspector } from "./ui/CellInspector";
import { AbundanceChart } from "./ui/AbundanceChart";
import { ModelSelector, type ModelOption } from "./ui/ModelSelector";
import { simulationEngine } from "./sim/engine";
import { placeholderDiffusionModel } from "./sim/placeholderModel";
import { RealNeuralLandscapeModel } from "./sim/realModel";
import type { IslandBundle } from "./manifest/types";

// Validated (dataviz skill) 8-slot colorblind-safe categorical order.
// Assigned to species in the fixed order the model/data pipeline uses
// (alphabetical, from load_occurrence_csv) — never reassigned by rank.
const SPECIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#e34948", // red — was aqua (#1baf7a), too close in tone to the dark ocean/terrain grays to read well
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#1baf7a", // aqua
];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      speciesNames: string[];
      abioticChannelNames: string[];
      modelOptions: ModelOption[];
    };

/** Reads the active model's identity live — which model is running can
 * change at any time via ModelSelector. */
function ModelStatusBanner() {
  const snapshot = useSyncExternalStore(
    (cb) => simulationEngine.subscribe(cb),
    () => simulationEngine.getSnapshot()
  );
  return snapshot.isPlaceholder ? (
    <span>Placeholder simulation ({snapshot.modelId}) — not the trained model.</span>
  ) : (
    <span>Trained model: {snapshot.modelId}.</span>
  );
}

export default function App() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    async function load() {
      const [manifest, landMaskBuf, abioticStaticBuf, abioticVaryingBuf, hillshadeBuf] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}island.json`).then((r) => {
          if (!r.ok) throw new Error(`island.json: ${r.status} ${r.statusText}`);
          return r.json() as Promise<IslandBundle>;
        }),
        fetch(`${import.meta.env.BASE_URL}landmask.bin`).then((r) => r.arrayBuffer()),
        fetch(`${import.meta.env.BASE_URL}abiotic_static.bin`).then((r) => r.arrayBuffer()),
        fetch(`${import.meta.env.BASE_URL}abiotic_varying.bin`).then((r) => r.arrayBuffer()),
        fetch(`${import.meta.env.BASE_URL}hillshade.bin`).then((r) => r.arrayBuffer()),
      ]);
      gridStore.init(manifest, landMaskBuf, abioticStaticBuf, abioticVaryingBuf, hillshadeBuf);

      const modelOptions: ModelOption[] = [
        { id: placeholderDiffusionModel.id, label: "Placeholder (diffusion)", model: placeholderDiffusionModel },
      ];

      // The trained model is optional — its weight files may not exist yet
      // for every deployment, and its species set must exactly match this
      // world bundle's (same order, same count) for the channel shapes to
      // line up. Missing or mismatched is not an error, just "not offered."
      try {
        const realModel = await RealNeuralLandscapeModel.load(
          `${import.meta.env.BASE_URL}model/no_detection_history`
        );
        const matches =
          realModel.speciesNames.length === manifest.speciesNames.length &&
          realModel.speciesNames.every((name, i) => name === manifest.speciesNames[i]);
        if (matches) {
          modelOptions.push({
            id: realModel.id,
            label: `Trained model (${realModel.id})`,
            model: realModel,
          });
          simulationEngine.setModel(realModel); // default to the real model when available
        } else {
          console.warn(
            "Trained model species do not match the world bundle's — not offering it.",
            { model: realModel.speciesNames, world: manifest.speciesNames }
          );
        }
      } catch (err) {
        console.warn("No trained model available, using the placeholder only.", err);
      }

      return { manifest, modelOptions };
    }
    load()
      .then(({ manifest, modelOptions }) =>
        setLoad({
          status: "ready",
          speciesNames: manifest.speciesNames,
          abioticChannelNames: manifest.abioticChannelNames,
          modelOptions,
        })
      )
      .catch((err) => setLoad({ status: "error", message: String(err) }));
  }, []);

  if (load.status === "loading") {
    return <div className="app-loading">Loading Surtsey…</div>;
  }
  if (load.status === "error") {
    return (
      <div className="app-error">
        Failed to load island data: {load.message}. Did you run
        web/export/export_island_bundle.py?
      </div>
    );
  }

  const colors = SPECIES_COLORS.slice(0, load.speciesNames.length);
  if (load.speciesNames.length > SPECIES_COLORS.length) {
    console.warn(
      `${load.speciesNames.length} species but only ${SPECIES_COLORS.length} ` +
        "validated palette colors — extra species will repeat the last color."
    );
    while (colors.length < load.speciesNames.length) {
      colors.push(SPECIES_COLORS[SPECIES_COLORS.length - 1]);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Surtsey Sandbox</h1>
        <p className="epoch">
          <ModelStatusBanner /> The coastline erodes as you step, matching the real
          distance-to-shore data.
        </p>
      </header>
      <div className="app-body">
        <aside className="tools-panel">
          <SpeciesPalette speciesNames={load.speciesNames} speciesColors={colors} />
          <Toolbar />
          <PlaybackControls />
          <ModelSelector options={load.modelOptions} />
        </aside>
        <main>
          <IslandView speciesColors={colors} cellSize={3} />
        </main>
        <aside className="inspector-panel">
          <CellInspector
            speciesNames={load.speciesNames}
            speciesColors={colors}
            abioticChannelNames={load.abioticChannelNames}
          />
          <AbundanceChart speciesNames={load.speciesNames} speciesColors={colors} />
        </aside>
      </div>
    </div>
  );
}
