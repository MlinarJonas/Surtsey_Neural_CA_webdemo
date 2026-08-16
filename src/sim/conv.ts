/**
 * Generic 2D numerical primitives mirroring src/nca/perception.py and
 * src/nca/utils.py exactly — same formulas, same padding semantics, so the
 * ported forward pass matches PyTorch bit-for-bit (verified by the parity
 * test in sim/__tests__/parity.mjs).
 */

export interface SobelKernels {
  sobelX: Float32Array;
  sobelY: Float32Array;
  kernelSize: number;
}

function binomial(n: number, k: number): number {
  let res = 1;
  for (let i = 0; i < k; i++) res = (res * (n - i)) / (i + 1);
  return res;
}

/** Mirrors create_perception_filters() in perception.py: separable Sobel
 * (binomial-smooth x linear-derivative), L1-normalized. Identity is handled
 * separately by callers (it's just the channel itself, no convolution needed). */
export function createSobelKernels(kernelSize: number): SobelKernels {
  if (kernelSize < 3 || kernelSize % 2 === 0) {
    throw new Error(`kernelSize must be an odd integer >= 3, got ${kernelSize}`);
  }
  const centre = Math.floor(kernelSize / 2);
  const n = kernelSize - 1;
  const smooth = new Float32Array(kernelSize);
  for (let i = 0; i < kernelSize; i++) smooth[i] = binomial(n, i);
  const deriv = new Float32Array(kernelSize);
  for (let i = 0; i < kernelSize; i++) deriv[i] = i - centre;

  const sobelX = new Float32Array(kernelSize * kernelSize);
  const sobelY = new Float32Array(kernelSize * kernelSize);
  let sumAbsX = 0;
  let sumAbsY = 0;
  for (let r = 0; r < kernelSize; r++) {
    for (let c = 0; c < kernelSize; c++) {
      const vx = smooth[r] * deriv[c]; // smooth in y, derivative in x
      const vy = deriv[r] * smooth[c]; // derivative in y, smooth in x
      sobelX[r * kernelSize + c] = vx;
      sobelY[r * kernelSize + c] = vy;
      sumAbsX += Math.abs(vx);
      sumAbsY += Math.abs(vy);
    }
  }
  for (let i = 0; i < sobelX.length; i++) sobelX[i] /= sumAbsX;
  for (let i = 0; i < sobelY.length; i++) sobelY[i] /= sumAbsY;

  return { sobelX, sobelY, kernelSize };
}

/** Standard 3x3 binomial Gaussian approximation, matching make_gaussian_blur_kernel(). */
export const GAUSSIAN_3X3 = Float32Array.from(
  [1, 2, 1, 2, 4, 2, 1, 2, 1].map((v) => v / 16)
);

/** Cross-correlation (PyTorch conv2d convention — no kernel flip) with
 * replicate (edge-clamp) padding, matching perceive()'s F.pad(mode="replicate")
 * + F.conv2d(padding=0). */
export function convolve2DReplicate(
  channel: Float32Array,
  gridH: number,
  gridW: number,
  kernel: Float32Array,
  kernelSize: number
): Float32Array {
  const pad = Math.floor(kernelSize / 2);
  const out = new Float32Array(gridH * gridW);
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      let sum = 0;
      for (let kr = 0; kr < kernelSize; kr++) {
        let sr = row + kr - pad;
        if (sr < 0) sr = 0;
        else if (sr >= gridH) sr = gridH - 1;
        const rowOffset = sr * gridW;
        const kRowOffset = kr * kernelSize;
        for (let kc = 0; kc < kernelSize; kc++) {
          let sc = col + kc - pad;
          if (sc < 0) sc = 0;
          else if (sc >= gridW) sc = gridW - 1;
          sum += channel[rowOffset + sc] * kernel[kRowOffset + kc];
        }
      }
      out[row * gridW + col] = sum;
    }
  }
  return out;
}

/** Repeated 3x3 Gaussian blur (replicate padding), matching _compute_proximity(). */
export function repeatedGaussianBlur(
  channel: Float32Array,
  gridH: number,
  gridW: number,
  steps: number
): Float32Array {
  let x = channel;
  for (let i = 0; i < steps; i++) {
    x = convolve2DReplicate(x, gridH, gridW, GAUSSIAN_3X3, 3);
  }
  return x;
}

/** Max-pool with out-of-bounds cells excluded from the window (equivalent to
 * PyTorch's -infinity pool padding whenever all real values are >= 0, which
 * biotic always is here) — matches NeuralLandscape.alive_mask(). */
export function maxPoolIgnoreOOB(
  channel: Float32Array,
  gridH: number,
  gridW: number,
  kernelSize: number
): Float32Array {
  const pad = Math.floor(kernelSize / 2);
  const out = new Float32Array(gridH * gridW);
  for (let row = 0; row < gridH; row++) {
    const rMin = Math.max(0, row - pad);
    const rMax = Math.min(gridH - 1, row + pad);
    for (let col = 0; col < gridW; col++) {
      const cMin = Math.max(0, col - pad);
      const cMax = Math.min(gridW - 1, col + pad);
      let m = -Infinity;
      for (let r = rMin; r <= rMax; r++) {
        const rowOffset = r * gridW;
        for (let c = cMin; c <= cMax; c++) {
          const v = channel[rowOffset + c];
          if (v > m) m = v;
        }
      }
      out[row * gridW + col] = m;
    }
  }
  return out;
}
