import type { GridContext, NCAModel, SimState } from "./types";
import {
  convolve2DReplicate,
  createSobelKernels,
  maxPoolIgnoreOOB,
  repeatedGaussianBlur,
  type SobelKernels,
} from "./conv";

/** Shape of web/frontend/public/model/model.json, written by
 * web/export/export_model_bundle.py. Every field the forward pass branches
 * on — nothing about a specific checkpoint's architecture is hardcoded here. */
export interface RealModelManifest {
  modelId: string;
  gridH: number;
  gridW: number;
  nAbiotic: number;
  nSpecies: number;
  speciesNames: string[];
  hiddenSize: number;
  perceptionKernelSize: number;
  aliveKernelSize: number;
  proximityBlurSteps: number;
  gateEpsilon: number;
  useProximity: boolean;
  useBioticSobel: boolean;
  useDetectionHistory: boolean;
  primaryColonisation: boolean;
  aliveMaskTrainingOnly: boolean;
  perceptionSize: number;
  /** Consecutive model calls per simulated year, land_mask/abiotic held fixed
   * across all of them. Optional only defensively, against a stale un-re-exported
   * model.json — every current export includes it. */
  ncaStepsPerInterval?: number;
}

/**
 * Ported inference-time forward pass of NeuralLandscape (src/nca/nl_model.py),
 * validated bit-for-bit against PyTorch — see sim/__tests__/parity.mjs.
 *
 * Spectral normalization is NOT reimplemented here: the exported conv weights
 * are already the materialized (post power-iteration) matrices, read directly
 * from the checkpoint's `.weight` after one PyTorch forward pass in eval mode.
 * That's the correct — and only necessary — thing to port for a frozen
 * inference checkpoint; re-deriving sigma from weight_orig/u/v in JS would be
 * solving a training-time problem that doesn't exist at inference.
 *
 * Training-only branches (stochastic fire-rate masking, the ghost-layer
 * pre-mask save) are intentionally not ported — forward() itself skips them
 * whenever self.training is False, which is always true here.
 */
export class RealNeuralLandscapeModel implements NCAModel {
  readonly id: string;
  readonly isPlaceholder = false;
  readonly stepsPerYear: number;

  private readonly manifest: RealModelManifest;
  private readonly conv1Weight: Float32Array; // (hiddenSize, perceptionSize)
  private readonly conv1Bias: Float32Array; // (hiddenSize,)
  private readonly conv2Weight: Float32Array; // (nSpecies, hiddenSize)
  private readonly sobel: SobelKernels; // shared: abiotic/biotic/proximity all use perceptionKernelSize

  /** The exact species this checkpoint's channels correspond to, in order —
   * callers must verify this matches the world bundle's speciesNames before
   * using this model; a mismatch means the weight shapes don't line up with
   * gridStore's biotic channels. */
  get speciesNames(): readonly string[] {
    return this.manifest.speciesNames;
  }

  private constructor(
    manifest: RealModelManifest,
    conv1Weight: Float32Array,
    conv1Bias: Float32Array,
    conv2Weight: Float32Array,
    sobel: SobelKernels
  ) {
    this.manifest = manifest;
    this.conv1Weight = conv1Weight;
    this.conv1Bias = conv1Bias;
    this.conv2Weight = conv2Weight;
    this.sobel = sobel;
    this.id = manifest.modelId;
    this.stepsPerYear = manifest.ncaStepsPerInterval ?? 1;
  }

  /** Fetches the manifest + weights from a URL (browser runtime path). Callers
   * should pass a path prefixed with import.meta.env.BASE_URL — a hardcoded
   * absolute path resolves to the domain root, not the deployed base path
   * (this bit a GitHub Pages project-site deploy once already). */
  static async load(baseUrl = `${import.meta.env.BASE_URL}model`): Promise<RealNeuralLandscapeModel> {
    const [manifest, conv1WeightBuf, conv1BiasBuf, conv2WeightBuf] = await Promise.all([
      fetch(`${baseUrl}/model.json`).then((r) => {
        if (!r.ok) throw new Error(`model.json: ${r.status} ${r.statusText}`);
        return r.json() as Promise<RealModelManifest>;
      }),
      fetch(`${baseUrl}/conv1_weight.bin`).then((r) => r.arrayBuffer()),
      fetch(`${baseUrl}/conv1_bias.bin`).then((r) => r.arrayBuffer()),
      fetch(`${baseUrl}/conv2_weight.bin`).then((r) => r.arrayBuffer()),
    ]);
    return RealNeuralLandscapeModel.fromBuffers(
      manifest,
      new Float32Array(conv1WeightBuf),
      new Float32Array(conv1BiasBuf),
      new Float32Array(conv2WeightBuf)
    );
  }

  /** Constructs directly from already-loaded buffers — used by load() and by
   * the Node-side parity test, which reads the same files via fs instead of fetch. */
  static fromBuffers(
    manifest: RealModelManifest,
    conv1Weight: Float32Array,
    conv1Bias: Float32Array,
    conv2Weight: Float32Array
  ): RealNeuralLandscapeModel {
    const sobel = createSobelKernels(manifest.perceptionKernelSize);
    return new RealNeuralLandscapeModel(manifest, conv1Weight, conv1Bias, conv2Weight, sobel);
  }

  step(state: SimState, ctx: GridContext): SimState {
    const { gridH, gridW, landMask, abiotic } = ctx;
    const cells = gridH * gridW;
    const m = this.manifest;
    const k = m.perceptionKernelSize;

    // --- Step 1: perceive abiotic (identity + Sobel-x + Sobel-y, interleaved per channel) ---
    const cnnInput: Float32Array[] = [];
    for (let c = 0; c < m.nAbiotic; c++) {
      cnnInput.push(abiotic[c]); // identity — read-only, safe to reference directly
      cnnInput.push(convolve2DReplicate(abiotic[c], gridH, gridW, this.sobel.sobelX, k));
      cnnInput.push(convolve2DReplicate(abiotic[c], gridH, gridW, this.sobel.sobelY, k));
    }

    // --- Step 2: biotic enters as raw identity (no Sobel) ---
    for (let s = 0; s < m.nSpecies; s++) cnnInput.push(state.biotic[s]);

    // --- Step 3: optional raw-biotic Sobel ---
    if (m.useBioticSobel) {
      for (let s = 0; s < m.nSpecies; s++) {
        cnnInput.push(state.biotic[s]);
        cnnInput.push(convolve2DReplicate(state.biotic[s], gridH, gridW, this.sobel.sobelX, k));
        cnnInput.push(convolve2DReplicate(state.biotic[s], gridH, gridW, this.sobel.sobelY, k));
      }
    }

    // --- Step 4: optional proximity (repeated Gaussian blur) + its Sobel ---
    if (m.useProximity) {
      for (let s = 0; s < m.nSpecies; s++) {
        const prox = repeatedGaussianBlur(state.biotic[s], gridH, gridW, m.proximityBlurSteps);
        cnnInput.push(prox);
        cnnInput.push(convolve2DReplicate(prox, gridH, gridW, this.sobel.sobelX, k));
        cnnInput.push(convolve2DReplicate(prox, gridH, gridW, this.sobel.sobelY, k));
      }
    }

    // --- Step 5: optional detection history (externally maintained, never zero'd by the model) ---
    if (m.useDetectionHistory) {
      for (let s = 0; s < m.nSpecies; s++) cnnInput.push(state.detectionHistory[s]);
    }

    // --- Step 6: conv1 (1x1) -> ReLU -> conv2 (1x1, no bias) — per-pixel linear layers ---
    // Accumulated as (channel outer, hidden/species middle, cell inner) rather than the
    // mathematically-equivalent (hidden/species, cell, channel) nesting: cnnInput[c] and
    // hidden[h] are then looked up once per c/h instead of once per (h,i,c)/(s,i,h)
    // triple — the array-of-arrays indirection was the dominant cost (~13% faster end
    // to end, measured via test:parity). Same left-to-right summation order per output
    // cell either way, but NOT bit-identical to the original: accumulating directly into
    // a Float32Array rounds to float32 on every add instead of once at the end (the
    // original kept `sum` as a plain JS double throughout the inner loop) — parity diff
    // shifted from 1.19e-7 to 5.96e-8, both float32-epsilon-scale noise, ~1700x under
    // the 1e-4 tolerance either way.
    const hidden: Float32Array[] = Array.from({ length: m.hiddenSize }, () => new Float32Array(cells));
    for (let h = 0; h < m.hiddenSize; h++) hidden[h].fill(this.conv1Bias[h]);
    for (let c = 0; c < cnnInput.length; c++) {
      const inputCh = cnnInput[c];
      for (let h = 0; h < m.hiddenSize; h++) {
        const w = this.conv1Weight[h * m.perceptionSize + c];
        const out = hidden[h];
        for (let i = 0; i < cells; i++) out[i] += w * inputCh[i];
      }
    }
    for (let h = 0; h < m.hiddenSize; h++) {
      const out = hidden[h];
      for (let i = 0; i < cells; i++) if (out[i] < 0) out[i] = 0; // ReLU
    }

    // bioticDelta starts at 0 (Float32Array's own default), so no init pass needed here.
    const bioticDelta: Float32Array[] = Array.from({ length: m.nSpecies }, () => new Float32Array(cells));
    for (let h = 0; h < m.hiddenSize; h++) {
      const hiddenCh = hidden[h];
      for (let s = 0; s < m.nSpecies; s++) {
        const w = this.conv2Weight[s * m.hiddenSize + h];
        const out = bioticDelta[s];
        for (let i = 0; i < cells; i++) out[i] += w * hiddenCh[i];
      }
    }

    // --- Step 7: biotic gate — delta *= (biotic + gate_epsilon).clamp(max=1); new = biotic + delta*gate ---
    const newBiotic: Float32Array[] = Array.from({ length: m.nSpecies }, () => new Float32Array(cells));
    for (let s = 0; s < m.nSpecies; s++) {
      const bioticCh = state.biotic[s];
      const deltaCh = bioticDelta[s];
      const out = newBiotic[s];
      for (let i = 0; i < cells; i++) {
        const gate = Math.min(bioticCh[i] + m.gateEpsilon, 1.0);
        out[i] = bioticCh[i] + deltaCh[i] * gate;
      }
    }

    // --- Step 8: alive mask. At inference (training=false), forward() applies it
    // iff primaryColonisation && !aliveMaskTrainingOnly. ---
    const applyAliveMask = m.primaryColonisation && !m.aliveMaskTrainingOnly;
    if (applyAliveMask) {
      for (let s = 0; s < m.nSpecies; s++) {
        const preAlive = maxPoolIgnoreOOB(state.biotic[s], gridH, gridW, m.aliveKernelSize);
        const postAlive = maxPoolIgnoreOOB(newBiotic[s], gridH, gridW, m.aliveKernelSize);
        const out = newBiotic[s];
        for (let i = 0; i < cells; i++) {
          if (!(preAlive[i] > 0.01 && postAlive[i] > 0.01)) out[i] = 0;
        }
      }
    }

    // --- Step 9: hard land-mask constraint + clamp [0, 1] ---
    for (let s = 0; s < m.nSpecies; s++) {
      const out = newBiotic[s];
      for (let i = 0; i < cells; i++) {
        let v = out[i] * landMask[i];
        if (v < 0) v = 0;
        else if (v > 1) v = 1;
        out[i] = v;
      }
    }

    return { biotic: newBiotic, detectionHistory: state.detectionHistory };
  }
}
