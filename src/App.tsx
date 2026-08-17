import { useEffect, useState, useSyncExternalStore } from "react";
import "./App.css";
import { gridStore } from "./state/gridStore";
import { IslandView } from "./render/IslandView";
import { SpeciesPalette } from "./ui/SpeciesPalette";
import { Toolbar } from "./ui/Toolbar";
import { PlaybackControls } from "./ui/PlaybackControls";
import { CellInspector } from "./ui/CellInspector";
import { AbundanceChart } from "./ui/AbundanceChart";
import { CompositionChart } from "./ui/CompositionChart";
import { ExtentChart } from "./ui/ExtentChart";
import { SuitabilityChart } from "./ui/SuitabilityChart";
import { ModelSelector, type ModelOption } from "./ui/ModelSelector";
import { IslandMark, WarningIcon } from "./ui/icons";
import { simulationEngine } from "./sim/engine";
import { placeholderDiffusionModel } from "./sim/placeholderModel";
import { RealNeuralLandscapeModel } from "./sim/realModel";
import type { IntroductionEvent, IslandBundle } from "./manifest/types";

// Validated (dataviz skill) 8-slot colorblind-safe categorical palette — dark-mode
// steps (the skill's palette.md has separate light/dark hex per hue; this app is
// dark-themed throughout, but was accidentally using the LIGHT steps until now).
// Assigned to species in the fixed order the model/data pipeline uses (alphabetical,
// from load_occurrence_csv) — never reassigned by rank.
//
// The first 5 slots (all that are currently active) are not just the palette's
// default order: GridCanvas renders species as freely-overlapping regions on a map
// (any two can be spatial neighbors anywhere), which is the skill's "all-pairs"
// case — the default order only guarantees its first THREE slots distinguishable
// under colorblindness there. With 5 species active, an exhaustive search over all
// 56 five-hue subsets of the 8 (node scripts/validate_palette.js, --pairs all,
// --mode dark) found blue+aqua+yellow+green+red as the best achievable — worst-pair
// separation ΔE 11.9, up from ΔE 7.1 for the old blue+orange+red+yellow+magenta
// selection (which stacked 3 warm hues together). Still short of the strict 15.0
// floor: no 5-of-8 subset clears it for all-pairs (the skill's own docs predict
// this — beyond 3 series in an all-pairs chart, no palette choice fully solves it,
// only fewer simultaneous series or a secondary encoding like texture would). This
// is the closest color-only fix gets; the sidebar's species list (swatch + name)
// remains the fallback disambiguator.
const SPECIES_COLORS = [
  "#3987e5", // blue
  "#199e70", // aqua
  "#c98500", // yellow
  "#008300", // green
  "#e66767", // red
  "#d55181", // magenta
  "#9085e9", // violet
  "#d95926", // orange
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

      // Optional: only Surtsey-derived bundles ship a real introduction
      // schedule (see web/export/export_island_bundle.py). Missing/404 just
      // means Historical mode has nothing to offer for this world — not an
      // error, same convention as the trained-model fetch below.
      let introductions: IntroductionEvent[] = [];
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}introductions.json`);
        if (r.ok) introductions = await r.json();
      } catch (err) {
        console.warn("No introduction schedule available — Historical mode stays hidden.", err);
      }

      gridStore.init(manifest, landMaskBuf, abioticStaticBuf, abioticVaryingBuf, hillshadeBuf, introductions);

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
    return (
      <div className="app-loading">
        <IslandMark size={40} />
        <p>Loading Surtsey…</p>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="app-error">
        <WarningIcon />
        <h2>Couldn't load the island</h2>
        <p>{load.message}</p>
        <p>
          Did you run <code>web/export/export_island_bundle.py</code>?
        </p>
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
        <div className="brand">
          <IslandMark size={30} />
          <div>
            <h1>Surtsey Sandbox</h1>
            <p className="epoch">
              <ModelStatusBanner /> The coastline erodes as you step, matching the real
              distance-to-shore data.
            </p>
          </div>
        </div>
      </header>
      <div className="app-body">
        <aside className="tools-panel">
          <SpeciesPalette speciesNames={load.speciesNames} speciesColors={colors} />
          <Toolbar />
          <PlaybackControls />
          <ModelSelector options={load.modelOptions} />
        </aside>
        <main>
          <div className="viewport-frame">
            <IslandView speciesColors={colors} cellSize={3} />
          </div>
        </main>
        <aside className="inspector-panel">
          <CellInspector
            speciesNames={load.speciesNames}
            speciesColors={colors}
            abioticChannelNames={load.abioticChannelNames}
          />
          <AbundanceChart speciesNames={load.speciesNames} speciesColors={colors} />
          <CompositionChart speciesNames={load.speciesNames} speciesColors={colors} />
          <ExtentChart speciesNames={load.speciesNames} speciesColors={colors} />
          <SuitabilityChart
            speciesNames={load.speciesNames}
            speciesColors={colors}
            abioticChannelNames={load.abioticChannelNames}
          />
        </aside>
      </div>
    </div>
  );
}
