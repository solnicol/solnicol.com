// The visible-structure score is computed from the rendered surface itself.
//
// It measures what remains visually legible at two spatial scales:
//
// 1. Medium edge energy catches filaments, folds, and clear contours.
// 2. Coarse tonal variation catches softened swirls after their edges blur.
// 3. A scale-persistence gate keeps fine-only random noise from scoring as
//    meaningful form.
//
// The result is still a proxy, not a complexity claim. It is deliberately
// derived from the same rendered pixels for coffee and the noise comparison.

// Luminance bounds of the coffee palette in shaders.ts.
const LUM_LO = 0.5;
const LUM_HI = 0.95;
// Exclude the ceramic rim and meniscus from the measurement.
const FIELD_RADIUS = 0.8;
const MEDIUM_DOWN = 2; // 64 -> 32: contours and softened filaments
const COARSE_DOWN = 8; // 64 -> 8: broad residual swirls

// The uniform surface still has a tiny intentional sheen and grain. Remove
// that visual floor before normalising the coarse tonal term.
const TONAL_FLOOR = 0.025;
const TONAL_RANGE = 0.4;
const EDGE_REFERENCE = 0.115;
const EDGE_POWER = 3;
const FINE_NOISE_START = 0.13;
const FINE_NOISE_RANGE = 0.16;
const EXPECTED_SCALE_GAIN = MEDIUM_DOWN * 0.75;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function downsample(
  source: Float32Array,
  sourceMask: Uint8Array,
  n: number,
  factor: number
): { values: Float32Array; mask: Uint8Array; size: number } {
  const size = n / factor;
  const values = new Float32Array(size * size);
  const mask = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let count = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = (y * factor + sy) * n + x * factor + sx;
          if (sourceMask[i]) {
            sum += source[i];
            count++;
          }
        }
      }
      if (count >= (factor * factor) / 2) {
        const i = y * size + x;
        values[i] = sum / count;
        mask[i] = 1;
      }
    }
  }

  return { values, mask, size };
}

/** Mean absolute difference across valid horizontal and vertical neighbours. */
function edgeEnergy(values: Float32Array, mask: Uint8Array, n: number): number {
  let total = 0;
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (!mask[i]) continue;
      if (x + 1 < n && mask[i + 1]) {
        total += Math.abs(values[i + 1] - values[i]);
        count++;
      }
      if (y + 1 < n && mask[i + n]) {
        total += Math.abs(values[i + n] - values[i]);
        count++;
      }
    }
  }
  return count > 0 ? total / count : 0;
}

function standardDeviation(values: Float32Array, mask: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i]) continue;
    sum += values[i];
    count++;
  }
  if (count === 0) return 0;
  const mean = sum / count;
  let squared = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask[i]) squared += (values[i] - mean) ** 2;
  }
  return Math.sqrt(squared / count);
}

export interface StructureStats {
  fine: number;
  medium: number;
  tonal: number;
  persistence: number;
  raw: number;
  score: number;
}

/** Structure score in [0, 1] from an RGBA readback of the surface. */
export function structureScore(data: Uint8Array, size: number): number {
  return structureStats(data, size).score;
}

/** The components are exposed in development for visual calibration. */
export function structureStats(data: Uint8Array, size: number): StructureStats {
  const n = size;
  const concentration = new Float32Array(n * n);
  const mask = new Uint8Array(n * n);
  const half = n / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const o = i * 4;
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      if (data[o + 3] < 128 || dx * dx + dy * dy > FIELD_RADIUS * FIELD_RADIUS) continue;
      const luminance =
        (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
      concentration[i] = clamp01((luminance - LUM_LO) / (LUM_HI - LUM_LO));
      mask[i] = 1;
    }
  }

  const fine = edgeEnergy(concentration, mask, n);
  const mediumField = downsample(concentration, mask, n, MEDIUM_DOWN);
  const coarseField = downsample(concentration, mask, n, COARSE_DOWN);
  const medium = edgeEnergy(mediumField.values, mediumField.mask, mediumField.size);
  const coarseDeviation = standardDeviation(coarseField.values, coarseField.mask);

  // Coherent features retain or gain energy when viewed at a wider sampling
  // step. Fine noise loses energy through the 2x2 box filter.
  const persistence = fine > 0 ? clamp01(medium / (fine * EXPECTED_SCALE_GAIN)) : 0;
  // A compact heart has one large contour. Stirring increases the density of
  // organised contours, so make that difference legible without hardcoding
  // the gesture or simulation state into the score.
  const edge = clamp01((medium / EDGE_REFERENCE) ** EDGE_POWER) * persistence ** 1.5;
  const tonal = clamp01((coarseDeviation - TONAL_FLOOR) / TONAL_RANGE);
  // Fine-only contrast is visual busyness, not coherent structure. This is
  // evaluated for every rendered field, including coffee, rather than keyed
  // to the explicit noise comparison mode.
  const noiseGate = 1 - clamp01((fine - FINE_NOISE_START) / FINE_NOISE_RANGE);

  // Tonal structure carries less weight than a clear filament, but keeps the
  // curve alive while a swirl is still visible. It shares the persistence gate
  // so high-frequency noise cannot regain points through raw variance alone.
  const raw =
    (0.85 * edge + 0.15 * tonal * (0.2 + 0.8 * persistence ** 1.5)) * noiseGate;
  const score = clamp01(raw);
  return { fine, medium, tonal, persistence, raw, score };
}
