// GLSL for the Flat White experiment.
//
// The simulation stores milk concentration in a ping-pong texture. Each step
// back-traces that material through a transient, near-zero-net-circulation
// velocity field, then applies a small diffusion stencil. The display shader
// colours the resulting material and adds the crema, foam and ceramic surface.

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SIM_FRAG = /* glsl */ `
varying vec2 vUv;

uniform sampler2D uPrevious;
uniform vec2  uSimRes;
uniform float uTime;
uniform float uDt;
uniform float uAdvection;
uniform float uDiffusion;
uniform float uSeed;

const float PI = 3.14159265359;

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

// The same single-mass poured heart used by the earlier stateless model.
float heartField(vec2 q) {
  q += (vec2(vnoise(q * 3.0 + 7.3), vnoise(q * 3.0 + 2.9)) - 0.5) * 0.022;
  vec2 h = q - vec2(-0.015, -0.035);
  h.x *= 0.72;
  h.y -= 0.54 * sqrt(abs(h.x));
  h.y += 0.095 * exp(-h.x * h.x * 24.0);
  float lowerPull = 1.0 - smoothstep(-0.34, 0.08, h.y);
  h.y += 0.075 * exp(-h.x * h.x * 30.0) * lowerPull;
  return length(h) - 0.43;
}

vec2 vortex(vec2 p, vec2 centre, float spin, float radius) {
  vec2 d = p - centre;
  float falloff = exp(-dot(d, d) / (radius * radius));
  return vec2(-d.y, d.x) * spin * falloff;
}

// Residual circulation changes orientation twice as the pour settles. Each
// hand-off folds material stretched by the previous field, but unlike periodic
// stirring the sequence never cycles back or acquires a global direction.
vec2 velocity(vec2 p, float time) {
  float firstTurn = smoothstep(7.0, 12.0, time);
  float secondTurn = smoothstep(16.0, 23.0, time);

  vec2 c1 = mix(vec2(-0.30, 0.12), vec2(-0.20, -0.17), firstTurn);
  vec2 c2 = mix(vec2( 0.30,-0.12), vec2( 0.20,  0.17), firstTurn);
  vec2 v = vortex(p, c1,  0.44, 0.52);
  v += vortex(p, c2, -0.44, 0.52);

  float weightA = 1.0 - firstTurn;
  float weightB = firstTurn * (1.0 - secondTurn);
  float weightC = secondTurn;

  vec2 directionA = normalize(vec2(1.0, 0.28));
  vec2 directionB = normalize(vec2(-0.32, 1.0));
  vec2 directionC = normalize(vec2(0.76, 0.65));
  float positionA = dot(p, vec2(-directionA.y, directionA.x));
  float positionB = dot(p, vec2(-directionB.y, directionB.x));
  float positionC = dot(p, vec2(-directionC.y, directionC.x));

  float warpA = (vnoise(vec2(positionA * 2.30, 1.70)) - 0.5) * 1.10;
  float foldA = sin(positionA * PI * 3.05 + warpA);
  foldA += 0.18 * sin(positionA * PI * 5.10 - warpA * 0.55);
  float warpB = (vnoise(vec2(positionB * 2.15, 4.20)) - 0.5) * 1.10;
  float foldB = sin(positionB * PI * 2.75 - 0.55 + warpB);
  foldB += 0.18 * sin(positionB * PI * 4.70 + 0.35 - warpB * 0.60);
  float warpC = (vnoise(vec2(positionC * 2.25, 6.40)) - 0.5) * 1.10;
  float foldC = sin(positionC * PI * 3.20 + 0.80 + warpC);
  foldC += 0.18 * sin(positionC * PI * 5.30 - 0.25 - warpC * 0.50);

  v += 0.54 * (
    weightA * directionA * foldA
    + weightB * directionB * foldB
    + weightC * directionC * foldC
  );

  // Flow fades before the circular liquid wall, keeping milk in the visible
  // bowl rather than losing it into the corners of the simulation texture.
  float wall = 1.0 - smoothstep(0.68, 0.88, length(p));
  return v * wall;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (uSeed > 0.5) {
    float edge = 2.0 / uSimRes.y;
    float heart = smoothstep(edge, -edge, heartField(p));
    // A flat white already contains milk outside the visible pour. Seeding a
    // low background fraction makes the conserved final mean a plausible tan.
    float milk = mix(0.11, 1.0, heart);
    gl_FragColor = vec4(milk, milk, milk, 1.0);
    return;
  }

  vec2 texel = 1.0 / uSimRes;
  vec2 back = clamp(vUv - velocity(p, uTime) * uAdvection * uDt * 0.038,
                    texel * 1.5, 1.0 - texel * 1.5);
  float centre = texture2D(uPrevious, back).r;
  float neighbours =
      texture2D(uPrevious, back + vec2(texel.x, 0.0)).r
    + texture2D(uPrevious, back - vec2(texel.x, 0.0)).r
    + texture2D(uPrevious, back + vec2(0.0, texel.y)).r
    + texture2D(uPrevious, back - vec2(0.0, texel.y)).r;
  neighbours *= 0.25;

  float diffusion = clamp(uDiffusion * uDt, 0.0, 0.24);
  float milk = mix(centre, neighbours, diffusion);
  // Once local gradients have softened, approximate the unresolved long-range
  // tail of diffusion towards the conserved mean of the seeded concentration.
  // This term is dormant throughout folding and early diffusion.
  float coarseDiffusion = clamp((uDiffusion - 1.0) * uDt * 0.45, 0.0, 0.08);
  milk = mix(milk, 0.33, coarseDiffusion);
  gl_FragColor = vec4(milk, milk, milk, 1.0);
}
`;

export const DISPLAY_FRAG = /* glsl */ `
varying vec2 vUv;

uniform sampler2D uMilk;
uniform vec2  uRes;
uniform float uTime;
uniform float uReduced;

const vec3 ESPRESSO = vec3(0.718, 0.463, 0.243);
const vec3 CREMA    = vec3(0.553, 0.322, 0.145);
const vec3 CREAM    = vec3(0.973, 0.945, 0.894);

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

float milkAt(vec2 uv) {
  return texture2D(uMilk, clamp(uv, 0.002, 0.998)).r;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float edge = 2.0 / uRes.y;
  float inside = 1.0 - smoothstep(1.0 - edge * 2.0, 1.0, r);
  if (inside <= 0.0) discard;

  // Rotated-grid supersampling makes narrow simulated lamellae read cleanly.
  float px = 0.42 / uRes.y;
  vec2 o1 = vec2(px, -3.0 * px) * 0.5;
  vec2 o2 = vec2(3.0 * px, px) * 0.5;
  float m = 0.0;
  m += milkAt(vUv + o1);
  m += milkAt(vUv - o1);
  m += milkAt(vUv + o2);
  m += milkAt(vUv - o2);
  m *= 0.25;

  // Crema texture is independent of the concentration boundaries. It stays
  // irregular and subdued so simulated material, not procedural stripes,
  // carries the structure.
  vec2 grainDomain = p + vec2(
    fbm(p * 4.5 + 7.0) - 0.5,
    fbm(p * 4.5 + 2.0) - 0.5
  ) * 0.08;
  float cremaFlow = fbm(vec2(grainDomain.x * 11.0 + grainDomain.y * 3.0,
                             grainDomain.y * 7.0 - grainDomain.x * 2.0));
  float cremaShade = 0.25 + 0.34 * cremaFlow;
  vec3 coffee = mix(ESPRESSO, CREMA, cremaShade);
  coffee *= 0.92 + 0.15 * fbm(grainDomain * 30.0);

  float foamGrain = fbm(p * 58.0 + vec2(0.0, uTime * 0.01 * (1.0 - uReduced)));
  vec3 foam = mix(CREAM * 0.91, CREAM * 1.035, foamGrain);
  float bleed = 4.0 * m * (1.0 - m);
  foam = mix(foam, vec3(0.86, 0.67, 0.47), bleed * 0.22);
  vec3 col = mix(coffee, foam, m);

  // A displaced-crema halo gives each emergent interface pressure against the
  // coffee, without inventing additional edges.
  float halo = smoothstep(0.08, 0.72, bleed) * (1.0 - smoothstep(0.28, 0.78, m));
  col = mix(col, CREMA * 0.72, halo * (0.40 + 0.22 * cremaFlow));

  vec2 texel = 1.0 / uRes;
  float nx = milkAt(vUv + vec2(texel.x, 0.0)) - milkAt(vUv - vec2(texel.x, 0.0));
  float ny = milkAt(vUv + vec2(0.0, texel.y)) - milkAt(vUv - vec2(0.0, texel.y));
  float microX = fbm(p * 96.0 + vec2(3.0, 7.0)) - 0.5;
  float microY = fbm(p.yx * 96.0 + vec2(11.0, 2.0)) - 0.5;
  vec3 normal = normalize(vec3(-nx * 4.0 + microX * 0.14,
                                -ny * 4.0 + microY * 0.14, 1.0));
  vec3 light = normalize(vec3(-0.45, 0.62, 0.75));
  float lightHit = max(dot(normal, light), 0.0);
  float foamGloss = pow(lightHit, 30.0) * m;
  float sheen = clamp(1.0 - length(p - vec2(-0.32, 0.36)) * 1.24, 0.0, 1.0);
  col += vec3(1.0, 0.94, 0.84) * (foamGloss * 0.10 + sheen * sheen * m * 0.05);

  float bubbleField = step(0.94, hash(floor(p * 74.0 + cremaFlow * 8.0)));
  float bubbleZone = smoothstep(0.66, 0.84, r) * (1.0 - smoothstep(0.84, 0.90, r));
  col = mix(col, CREMA * 0.8, bubbleField * bubbleZone * (1.0 - m) * 0.24);

  float aa = 3.0 / uRes.y;
  float edgeDark = smoothstep(0.84, 0.92, r);
  col = mix(col, col * 0.80, edgeDark * 0.5);

  float men = smoothstep(0.92 - aa, 0.92 + aa, r)
            * (1.0 - smoothstep(0.945 - aa, 0.945 + aa, r));
  col = mix(col, vec3(0.216, 0.125, 0.071), men * 0.6);

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
