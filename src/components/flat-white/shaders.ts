// GLSL for the Flat White surface.
//
// This is a *simplified* mixing model, not a fluid solver. The milk field is
// defined once in a "material" coordinate space (the rosetta), and stirring is
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
uniform float uReduced;  // 1 = prefers-reduced-motion

// Sampled from reference pours: the exposed surface is crema-lit caramel
// tan, not raw espresso black; the milk is a warm off-white.
const vec3  ESPRESSO  = vec3(0.718, 0.463, 0.243);  // caramel crema surface
const vec3  CREMA     = vec3(0.553, 0.322, 0.145);  // deeper pour shadows
const vec3  CREAM     = vec3(0.973, 0.945, 0.894);  // warm milk white
// A finished flat white is coffee lightened by milk, not a cup of hot milk.
// Keeping the mean below one half preserves the caramel coffee surface once
// every visible filament has dissolved.
const float MEAN_MILK = 0.38;

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

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h);
}

// Distance to one leaf of the rosetta. The leaf is a short, curved ribbon
// running from the stem out into the crema, not a stamped oval.
float leafDistance(vec2 p, float side, float y, float spread, float lift, float width) {
  vec2 previous = vec2(0.0, y);
  float d = 10.0;
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 6.0;
    // A quadratic Bezier bows the leaf outward before its tip turns upward.
    vec2 control = vec2(side * spread * 1.12, y + lift * 0.26);
    vec2 tip = vec2(side * spread, y + lift);
    vec2 point = mix(mix(vec2(0.0, y), control, t), mix(control, tip, t), t);
    d = min(d, segmentDistance(p, previous, point) - width * mix(1.15, 0.45, t));
    previous = point;
  }
  return d;
}

// A poured rosetta is a stack of paired leaves around a narrow stem, finished
// with a small heart. All shapes remain in material space, so stirring can
// stretch the whole pour instead of tearing a decal from the coffee.
float rosettaField(vec2 q) {
  q += (vec2(vnoise(q * 3.4 + 7.3), vnoise(q * 3.4 + 2.9)) - 0.5) * 0.012;
  float d = 10.0;

  for (int i = 0; i < 12; i++) {
    float t = (float(i) + 0.45) / 12.0;
    float y = -0.57 + t * 0.98;
    float spread = 0.46 * sin(t * 3.14159) * (0.92 + 0.08 * sin(t * 9.0));
    float lift = mix(0.19, 0.13, t);
    float width = mix(0.047, 0.022, t);
    d = min(d, leafDistance(q, -1.0, y, spread, lift, width));
    d = min(d, leafDistance(q, 1.0, y, spread, lift, width));
  }

  // The pull through the middle joins the leaves into one poured gesture.
  float stem = abs(q.x + 0.008 * sin(q.y * 18.0)) - 0.018;
  float stemMask = max(abs(q.y + 0.05) - 0.62, stem);
  d = min(d, stemMask);

  // The top finish is a small heart, not a separate emblem.
  vec2 h = q - vec2(0.0, 0.46);
  h.x *= 0.78;
  h.y -= 0.01;
  h.y -= 0.46 * sqrt(abs(h.x));
  h.y += 0.08 * exp(-h.x * h.x * 26.0);
  d = min(d, length(h) - 0.19);
  return d;
}

// All surface material shares one coordinate warp. The crema marbling, foam
// pores and rosetta therefore move together when the cup is stirred.
vec2 materialPoint(vec2 p) {
  vec2 q = p;

  // Live local vortex trailing the pointer.
  vec2 dp = q - uPointer;
  float g = uEnergy * exp(-dot(dp, dp) * 6.0) * 2.4;
  q = uPointer + rot(g) * dp;

  // Global differential rotation: the centre turns further than the rim,
  // so the poured leaves draw out into spiral filaments.
  float rr = length(q);
  float tw = uWind * (0.42 / (rr + 0.22));
  tw += 0.09 * uWind * sin(rr * 6.0 - uTime * 0.25 * (1.0 - uReduced));
  return rot(tw) * q;
}

// The surface flow fans outward from the stem, then curls up around each leaf.
// It is a compact procedural flow map for the crema grain and edge bleed.
vec2 rosettaFlow(vec2 q) {
  float side = q.x < 0.0 ? -1.0 : 1.0;
  float lift = mix(0.16, 0.34, smoothstep(-0.62, 0.5, q.y));
  vec2 fan = vec2(side * (0.78 + 0.16 * sin(q.y * 10.0)), lift);
  vec2 curl = vec2(-side * q.y * 0.14, 0.09 + abs(q.x) * 0.12);
  return normalize(fan + curl);
}

// Milk fraction (0 espresso .. 1 cream) at a surface point.
float milkAt(vec2 p) {
  vec2 q = materialPoint(p);
  float rr = length(q);
  float tw = uWind * (0.42 / (rr + 0.22));
  tw += 0.09 * uWind * sin(rr * 6.0 - uTime * 0.25 * (1.0 - uReduced));

  // Stretched milk smears wider rather than thinning to nothing, so the
  // filaments stay visible instead of over-mixing into flat espresso.
  float shear = clamp(abs(uWind) * 0.10, 0.0, 1.0);
  float d = rosettaField(q);
  float edgeFlow = fbm(q * 18.0 + vec2(q.y * 4.0, -q.x * 3.0)) - 0.5;
  float w = 0.014 + uDiffuse * 0.9 + shear * 0.16 + edgeFlow * 0.012;
  float milk = smoothstep(w, -w, d);

  // Microfoam is not a flat fill. Small brightness and density changes follow
  // the same material coordinates as the pour, so the velvet texture stretches
  // with the leaves when the surface is stirred.
  float depth = -d;
  float flow = fbm(vec2(q.x * 11.0 + q.y * 2.0, q.y * 5.0));
  float cells = fbm(q * 46.0);
  float edgeVeil = smoothstep(0.0, 0.075, depth) * (1.0 - smoothstep(0.12, 0.26, depth));
  float spine = exp(-q.x * q.x * 120.0) * smoothstep(0.62, 0.03, abs(q.y + 0.08));
  float tone = 0.96 + 0.07 * flow + 0.025 * cells - 0.13 * edgeVeil + 0.045 * spine;
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
  // Crema has directional flow and tonal depth rather than one brown swatch.
  // Its domain follows the same warped rosetta coordinates as the foam.
  vec2 q = materialPoint(p);
  vec2 flowDir = rosettaFlow(q);
  vec2 flowNormal = vec2(-flowDir.y, flowDir.x);
  vec2 flowDomain = q + flowDir * (fbm(q * 7.0) - 0.5) * 0.16;
  float cremaFlow = fbm(vec2(dot(flowDomain, flowDir) * 15.0, dot(flowDomain, flowNormal) * 8.0));
  float tiger = 0.5 + 0.5 * sin(dot(flowDomain, flowNormal) * 48.0 + cremaFlow * 11.0);
  float cremaShade = 0.26 + 0.28 * cremaFlow + 0.13 * tiger;
  vec3 coffee = mix(ESPRESSO, CREMA, cremaShade * (1.0 - 0.45 * uDiffuse));
  coffee *= 0.91 + 0.16 * fbm(flowDomain * 32.0);

  // Foam is warmer at its bleed zone and picks up tiny, glossy density shifts.
  float foamGrain = fbm(p * 58.0);
  vec3 foam = mix(CREAM * 0.91, CREAM * 1.035, foamGrain);
  float bleed = 4.0 * m * (1.0 - m);
  foam = mix(foam, vec3(0.86, 0.67, 0.47), bleed * 0.22);
  vec3 col = mix(coffee, foam, m);

  // A dark displaced-crema halo sits just outside the foam, not across the
  // whole blurred edge. It gives each leaf pressure against the coffee.
  float halo = smoothstep(0.08, 0.72, bleed) * (1.0 - smoothstep(0.28, 0.78, m));
  col = mix(col, CREMA * 0.72, halo * (0.42 + 0.28 * cremaFlow));

  // A fine normal from the milk field breaks the highlight into a velvety
  // surface instead of leaving a uniform digital disk.
  float nx = milkAt(p + vec2(px, 0.0)) - milkAt(p - vec2(px, 0.0));
  float ny = milkAt(p + vec2(0.0, px)) - milkAt(p - vec2(0.0, px));
  float microX = fbm(q * 96.0 + vec2(3.0, 7.0)) - 0.5;
  float microY = fbm(q.yx * 96.0 + vec2(11.0, 2.0)) - 0.5;
  vec3 normal = normalize(vec3(-nx * 3.0 + microX * 0.16, -ny * 3.0 + microY * 0.16, 1.0));
  vec3 light = normalize(vec3(-0.45, 0.62, 0.75));
  float lightHit = max(dot(normal, light), 0.0);
  float foamGloss = pow(lightHit, 34.0) * m * (0.55 + 0.45 * fbm(q * 74.0));
  float cremaGloss = pow(lightHit, 13.0) * (1.0 - m);
  float sheen = clamp(1.0 - length(p - vec2(-0.32, 0.36)) * 1.24, 0.0, 1.0);
  col += vec3(1.0, 0.94, 0.84) * (foamGloss * 0.11 + sheen * sheen * m * 0.055);
  col += vec3(0.94, 0.62, 0.34) * cremaGloss * 0.018;

  // Near the cup wall, tiny crema bubbles and an oil-darkened meniscus give
  // the surface a lived-in edge without placing labels or decals over it.
  float bubbleField = step(0.93, hash(floor(flowDomain * 74.0 + cremaFlow * 8.0)));
  float bubbleZone = smoothstep(0.66, 0.84, r) * (1.0 - smoothstep(0.84, 0.90, r));
  col = mix(col, CREMA * 0.8, bubbleField * bubbleZone * (1.0 - m) * 0.28);

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
