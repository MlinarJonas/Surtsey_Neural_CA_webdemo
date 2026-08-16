# Surtsey Sandbox

An interactive browser demo of a **Neural Cellular Automata (NCA)** model trained to
simulate primary ecological succession on **Surtsey**, the volcanic island that emerged
off Iceland in 1963. Paint species onto the island, then step or play the simulation
forward and watch the model's learned dispersal, growth, and competition dynamics unfold
against the real 1967 terrain.

**Live demo:** https://mlinarjonas.github.io/Surtsey_Neural_CA_webdemo/

## What this is

The model is a modified NCA: a small convolutional update rule, applied identically to
every grid cell, that treats abiotic conditions (terrain, distance to shore), dispersal,
and inter-species competition as learned dynamics rather than a static, per-cell
prediction — trained on real occurrence records from Surtsey (1965–1980) and real
terrain data (DEM, slope, aspect, wetness index).

This repo contains only the **web demo** — a from-scratch TypeScript port of the trained
PyTorch model's forward pass (validated bit-for-bit against the original), running
entirely client-side. There's no server: every simulation step runs in your browser.
The training code and research notebook this model came from live in a separate,
private repository (not yet public).

## Using it

- **Species panel**: pick a species and paint it onto the island with your cursor; the
  brush ghost-previews exactly which cells will be affected.
- **Step / Play**: advance the simulation. Each simulated year is animated through the
  model's real sub-step cadence (not a single jump), so a year visibly takes a few
  seconds to unfold — this is genuine computation, not artificially slowed down.
- **Erase**: remove a painted species; the value fades out rather than vanishing.
- **Blend / Dominant**: switch between showing all species' occupancy blended together,
  or just whichever species dominates each cell.
- The simulation can run past the real data's end year (1980) — terrain/coastline
  conditions hold at their last known state, and the model keeps extrapolating forward.

## Running locally

```bash
npm install
npm run dev
```

Requires Node 20+. `npm run build` produces a static `dist/` — the whole app is static
files (HTML/JS/CSS plus the model weights and terrain data as plain binary files under
`public/`), deployable anywhere that serves static content. This repo deploys
automatically to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

## Numerical parity

`npm run test:parity` compares this TypeScript port's output against a golden fixture
exported from the original PyTorch model (real data, fixed random seed) — max
difference on the order of float32 machine epsilon (~1e-7).
