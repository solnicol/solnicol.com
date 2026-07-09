// GLSL for the Flat White surface.
//
// This is a *simplified* mixing model, not a fluid solver. The milk field is
// defined once in a "material" coordinate space (the heart), and stirring is
// expressed as a coordinate warp read back per frame: a live vortex around the
// pointer plus a global differential rotation whose angle grows toward the
// centre. Differential rotation is what actually winds a compact blob into
// spiral filaments in a real cup, so it does the visual heavy lifting here.
// Diffusion is a blend of the whole field toward a single mean milk fraction.
//
// Keeping the field purely a function of a few uniforms is what makes the MVP
// cheap and stateless. A later upgrade would replace `milkAt` with a ping-pong
// texture sampled from a pair of render targets; the surface module and the
// component wiring would not have to change.

// `position` and `uv` are provided by three's ShaderMaterial; the quad spans
// clip space directly, so the camera matrices are intentionally ignored.
export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// three prepends the float precision qualifier for ShaderMaterial.
export const FRAG = /* glsl */ `
varying vec2 vUv;

uniform vec2  uRes;      // canvas size in device pixels (square)
uniform float uTime;     // seconds since start (frozen when reduced/paused)
uniform float uWind;     // accumulated signed winding, radians
uniform float uDiffuse;  // 0 = sharp, 1 = uniform
uniform float uEnergy;   // live stir energy near the pointer (decays)
uniform vec2  uPointer;  // last pointer position, surface space -1..1
uniform float uMode;     // 0 = coffee, 1 = noise comparison
uniform float uReduced;  // 1 = prefers-reduced-motion

// Sampled from reference pours: the exposed surface is crema-lit caramel
// tan, not raw espresso black; the milk is a warm off-white.
const vec3  ESPRESSO  = vec3(0.718, 0.463, 0.243);  // caramel crema surface
const vec3  CREMA     = vec3(0.553, 0.322, 0.145);  // deeper pour shadows
const vec3  CREAM     = vec3(0.973, 0.945, 0.894);  // warm milk white
const float MEAN_MILK = 0.60; // the settled flat-white fraction

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// Poured heart in material space; < 0 inside. Built the way a latte heart
// actually forms: a soft round milk mass (the monk's head) with a vertical
// centre pull that dips the top rim into a cleft and draws the bottom out
// into a tapered tail — one displacement does both, like the final cut of
// the pour. Not an icon SDF; a warped circle.
float heartField(vec2 q) {
  // Low-frequency edge perturbation: slight asymmetry and flow.
  q += (vec2(vnoise(q * 3.0 + 7.3), vnoise(q * 3.0 + 2.9)) - 0.5) * 0.03;
  vec2 h = q;
  h.x *= 0.72;  // plump: the mass is about as wide as it is tall
  h.y -= 0.02;
  // The cut, in two parts. sqrt lifts the sides relative to the centre
  // line, carving the V of the cleft and the point of the tail; the
  // gaussian drags the centre itself down, deepening the cleft slightly
  // and drawing the tail out.
  h.y -= 0.55 * sqrt(abs(h.x));
  h.y += 0.10 * exp(-h.x * h.x * 22.0);
  return length(h) - 0.44;
}

// Milk fraction (0 espresso .. 1 cream) at a surface point.
float milkAt(vec2 p) {
  vec2 q = p;

  // Live local vortex trailing the pointer.
  vec2 dp = q - uPointer;
  float g = uEnergy * exp(-dot(dp, dp) * 6.0) * 2.4;
  q = uPointer + rot(g) * dp;

  // Global differential rotation: the centre turns further than the rim,
  // so a compact heart is drawn out into spiral filaments.
  float rr = length(q);
  float tw = uWind * (0.42 / (rr + 0.22));
  tw += 0.09 * uWind * sin(rr * 6.0 - uTime * 0.25 * (1.0 - uReduced));
  q = rot(tw) * q;

  // Stretched milk smears wider rather than thinning to nothing, so the
  // filaments stay visible instead of over-mixing into flat espresso.
  float shear = clamp(abs(uWind) * 0.10, 0.0, 1.0);
  float d = heartField(q);
  float w = 0.016 + uDiffuse * 0.9 + shear * 0.16;
  float milk = smoothstep(w, -w, d);

  // Interior tone — stylised pour texture, not flat white. Rings follow the
  // silhouette (the pour's pulses), a faint flow grain runs top-to-bottom,
  // and the centre pull leaves a paler spine. All of it is a function of the
  // warped material coordinates, so stirring advects it with the milk.
  float depth = -d;
  float flow = fbm(vec2(q.x * 7.0, q.y * 2.6));
  // Phase-warped by the flow noise so the rings waver like pour pulses
  // instead of tracing one perfect moat around the silhouette.
  float rings = 0.5 + 0.5 * cos(depth * 36.0 + 2.5 * flow);
  float ringBand = smoothstep(0.02, 0.08, depth) * (1.0 - smoothstep(0.18, 0.34, depth));
  float spine = exp(-q.x * q.x * 70.0) * smoothstep(0.55, 0.05, abs(q.y + 0.05));
  float tone = 1.0 - 0.11 * rings * ringBand - 0.08 * (1.0 - flow) + 0.05 * spine;
  milk = clamp(milk * tone, 0.0, 1.0);

  // Striations read as folds; strongest mid-stir, then erased by diffusion.
  float damp = smoothstep(0.12, 0.5, rr); // avoid aliasing at the centre
  float bands = 0.5 + 0.5 * cos(tw * 4.0 + rr * 3.0);
  milk = mix(milk, milk * bands, 0.35 * shear * damp * (1.0 - uDiffuse));

  // Diffuse the whole field toward one uniform fraction.
  milk = mix(milk, MEAN_MILK, uDiffuse);
  return milk;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);

  float edge = 2.0 / uRes.y;
  float inside = 1.0 - smoothstep(1.0 - edge * 2.0, 1.0, r);
  if (inside <= 0.0) discard;

  vec3 col;
  if (uMode > 0.5) {
    // Comparison: high-frequency noise. Busy everywhere, coherent nowhere —
    // at low frequency fbm reads as clouds, which are (honestly) structure,
    // so the formless field must live at pixel scale.
    vec2 q = p;
    float n = fbm(q * 16.0 + vec2(uTime * 0.06 * (1.0 - uReduced), 0.0));
    n = fbm(q * 16.0 + n * 0.5);
    col = mix(ESPRESSO, CREAM, smoothstep(0.3, 0.7, n));
  } else {
    // Rotated-grid supersample keeps the thin filaments clean.
    float px = 0.42 / uRes.y;
    vec2 o1 = vec2(px, -3.0 * px);
    vec2 o2 = vec2(3.0 * px, px);
    float m = 0.0;
    m += milkAt(p + o1);
    m += milkAt(p - o1);
    m += milkAt(p + o2);
    m += milkAt(p - o2);
    m *= 0.25;
    col = mix(ESPRESSO, CREAM, m);
    col = mix(col, CREMA, (1.0 - m) * 0.35 * (1.0 - uDiffuse));
    // Faint static surface grain — the liquid's top, not a flat fill.
    col *= 0.985 + 0.03 * fbm(p * 5.5);
  }

  // Soft upper-left microfoam sheen on the liquid.
  float sheen = clamp(1.0 - length(p - vec2(-0.32, 0.36)) * 1.15, 0.0, 1.0);
  col += sheen * sheen * 0.05;

  // Vessel cue, not café realism: a warm ceramic rim and a meniscus shadow
  // give the surface containment — liquid in a cup, not a floating disk.
  // Coffee to 0.92, meniscus band to 0.945, stoneware to the edge; the CSS
  // box-shadow outside the canvas plays the outer cup shadow.
  float aa = 3.0 / uRes.y;

  // The liquid darkens slightly as it approaches the wall.
  float edgeDark = smoothstep(0.84, 0.92, r);
  col = mix(col, col * 0.80, edgeDark * 0.5);

  // Meniscus: thin warm inner shadow between liquid and ceramic.
  float men = smoothstep(0.92 - aa, 0.92 + aa, r)
            * (1.0 - smoothstep(0.945 - aa, 0.945 + aa, r));
  col = mix(col, vec3(0.216, 0.125, 0.071), men * 0.6);

  // Matte stoneware rim, lit from upper-left, slightly irregular.
  float ring = smoothstep(0.945 - aa, 0.945 + aa, r);
  vec3 ceramic = vec3(0.902, 0.824, 0.729);
  float lightDir = dot(p / max(r, 1e-4), normalize(vec2(-0.6, 0.75)));
  ceramic = mix(ceramic, vec3(1.0, 0.945, 0.859), clamp(lightDir, 0.0, 1.0) * 0.65);
  ceramic = mix(ceramic, vec3(0.725, 0.608, 0.494), clamp(-lightDir, 0.0, 1.0) * 0.4);
  ceramic *= 0.975 + 0.05 * vnoise(p * 9.0);
  ceramic = mix(ceramic, vec3(0.725, 0.608, 0.494), smoothstep(0.985, 1.0, r) * 0.45);
  col = mix(col, ceramic, ring);

  gl_FragColor = vec4(col, inside);
}
`;
