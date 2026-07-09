// The visible-structure score, computed from the rendered surface itself.
//
// The score must separate four states:
//   uniform beige      → ~0    (no boundaries at any scale)
//   clean heart        → low   (boundaries, but few and simple)
//   stirred filaments  → high  (many boundaries that persist at medium scale)
//   random noise       → low   (busy at fine scale, incoherent at medium)
//
// Raw contrast alone would rank noise highest, which is exactly the mistake
// the piece argues against. So the score is:
//
//   1. Map pixels to milk concentration via luminance.
//   2. fine   = fraction of neighbour pairs on the full sampling grid whose
//      concentration step exceeds a visibility threshold.
//   3. medium = the same fraction after box-downsampling — boundaries that
//      survive blurring, i.e. contours organised into shapes.
//   4. coherence = 1 − ρ·fine/medium, clamped to [0, 1]. For coherent form,
//      boundaries are sparse at pixel scale relative to shape scale
//      (fine ≪ medium); for noise, fine ≥ medium and coherence hits zero.
//   5. score  = medium × coherence: how much boundary there is, times how
//      much of it is organised into shapes.
//
// Boundary *density* (not gradient magnitude) is used so that many soft
// filaments out-score one crisp simple edge, and the ratio gate means noise
// scores near zero no matter how busy it is.
//
// It is a structure proxy, not a complexity measure — but it is computed
// from what is on screen, identically for the coffee and the noise field.

// Luminance bounds of the palette in shaders.ts: espresso ≈ 0.50, cream ≈ 0.95.
const LUM_LO = 0.5;
const LUM_HI = 0.95;
// Ignore pixels outside this fraction of the radius: the crema rim and
// vignette are staging, not part of the measured field.
const FIELD_RADIUS = 0.8;
const DOWN = 2; // box-filter factor for the medium scale (64 → 32)
// A step must clear the interior texture (rings/grain sit near 0.11) to
// count as a milk/coffee boundary; real edges step 0.4+.
const EDGE_T = 0.15;
const RHO = 1.0; // fine/medium ratio at which coherence reaches zero
const CALIBRATION = 0.13; // raw score that maps to 1.0
const GAMMA = 1.4; // display curve: spreads the moderate range downward

/** Fraction of 4-neighbour pairs whose step exceeds EDGE_T, over masked cells. */
function edgeFraction(c: Float32Array, mask: Uint8Array, n: number): number {
  let edges = 0;
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (!mask[i]) continue;
      if (x + 1 < n && mask[i + 1]) {
        if (Math.abs(c[i + 1] - c[i]) > EDGE_T) edges++;
        count++;
      }
      if (y + 1 < n && mask[i + n]) {
        if (Math.abs(c[i + n] - c[i]) > EDGE_T) edges++;
        count++;
      }
    }
  }
  return count > 0 ? edges / count : 0;
}

export interface StructureStats {
  fine: number;
  medium: number;
  raw: number;
  score: number;
}

/** Structure score in [0, 1] from an RGBA readback of the surface. */
export function structureScore(data: Uint8Array, size: number): number {
  return structureStats(data, size).score;
}

/** The score plus its components — for calibration and the README's honesty. */
export function structureStats(data: Uint8Array, size: number): StructureStats {
  const n = size;
  const c = new Float32Array(n * n);
  const mask = new Uint8Array(n * n);
  const half = n / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const o = i * 4;
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      if (data[o + 3] < 128 || dx * dx + dy * dy > FIELD_RADIUS * FIELD_RADIUS) {
        continue;
      }
      const lum =
        (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
      c[i] = Math.min(1, Math.max(0, (lum - LUM_LO) / (LUM_HI - LUM_LO)));
      mask[i] = 1;
    }
  }

  const fine = edgeFraction(c, mask, n);

  // Box-downsample to the medium scale.
  const m = n / DOWN;
  const cm = new Float32Array(m * m);
  const maskm = new Uint8Array(m * m);
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      let sum = 0;
      let count = 0;
      for (let sy = 0; sy < DOWN; sy++) {
        for (let sx = 0; sx < DOWN; sx++) {
          const i = (y * DOWN + sy) * n + (x * DOWN + sx);
          if (mask[i]) {
            sum += c[i];
            count++;
          }
        }
      }
      if (count >= (DOWN * DOWN) / 2) {
        cm[y * m + x] = sum / count;
        maskm[y * m + x] = 1;
      }
    }
  }

  const medium = edgeFraction(cm, maskm, m);

  const coherence =
    medium > 0 ? Math.min(1, Math.max(0, 1 - (RHO * fine) / medium)) : 0;
  const raw = medium * coherence;
  const score = Math.pow(Math.min(1, Math.max(0, raw / CALIBRATION)), GAMMA);
  const stats = { fine, medium, raw, score };
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (env?.DEV && typeof window !== "undefined") {
    (window as unknown as { __fwStructure?: StructureStats }).__fwStructure = stats;
  }
  return stats;
}
