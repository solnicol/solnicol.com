# Flat White

A small interactive model of structure between order and uniformity. A milk
rosetta on textured crema is stirred into filaments and eddies, then diffuses into a
uniform flat white — with a live curve tracking a **visible-structure proxy**.

**Live:** [full screen](https://solnicol.com/experiments/flat-white/) ·
embedded in the [project notes](https://solnicol.com/projects/flat-white/)

This folder is the canonical source. It renders as a React island inside the
[solnicol.com](https://solnicol.com) Astro site — there is no separate app.

## The idea

Order is simple; noise is simple; the interesting part is the unstable middle.
The rosetta is ordered but legible. A uniform beige is the maximum-entropy end
state and equally trivial. In between, stirring draws the milk into coherent
filaments — briefly *more* visible structure than either extreme — before
diffusion erases it.

This is a modest visual model of mixing (advection, stretching, folding,
diffusion), **not** a physics simulator and not a universal law. The measured
value is a *structure proxy*, not "true complexity".

## What it does

- **Stir** — drag or touch the surface. Angular motion around the centre winds
  the pattern; a live vortex trails the pointer.
- **Watch structure rise and fall** — an SVG curve labelled *visible structure*
  climbs through the stirred middle and falls as the surface settles.
- **Replay / Pause** — reset to the ordered rosetta, or freeze the evolution.

## How it works (MVP)

The surface is a single Three.js full-screen quad (`ShaderMaterial` on a plane)
drawn with a GLSL fragment shader.

The mixing is a **simplified, stateless model**, not a solver:

- The milk field is defined once in a *material* coordinate space. A central
  stem, paired curved leaves and a small top heart build the rosetta as one
  continuous poured gesture.
- Stirring is a coordinate warp read back per frame: a live vortex around the
  pointer, plus a **global differential rotation** whose angle grows toward the
  centre. Differential rotation is what actually winds a compact blob into
  spiral filaments, so it does the visual work.
- Diffusion blends the whole field toward one mean milk fraction and melts the
  edges.

## How the score is computed

The visible-structure curve is **measured from the rendered surface**, not
from the gesture. Every half second the current coffee surface is rendered into
a 64×64 offscreen target and read back, then scored in
`structure.ts`:

1. Pixels map to milk concentration via luminance, normalised between the
   espresso and cream tones. The crema rim is masked out.
2. **medium edge energy** measures the contour density after a 2x2 box blur.
   This rewards filaments and folds over a stable rosetta outline.
3. **coarse tonal variation** measures the remaining non-uniformity after an
   8x8 blur, so a visibly soft swirl does not disappear from the curve early.
4. **persistence and fine-detail gates** discount contrast that exists only at
   the smallest scale.
5. **score** combines those three render-derived terms. It never reads pointer
   motion, elapsed diffusion, or the comparison-mode flag.

The curve is calibrated so uniform coffee-and-milk reads near 0%, the clean
rosetta stays legible and the stirred middle rises before disappearing with the
surface. If the WebGL readback ever fails, the curve falls back to a
pointer-derived estimate rather than dying.

## What this taught me

The artefact is the residue of having to understand a handful of primitives
well enough to make them operate. Recording them here is the point: an object
you can interrogate beats an object you can only admire.

**The primitives underneath this project**

1. **Advection as a coordinate warp** — moving fluid is equivalent to moving
   *where you look up* the material. The shader never moves paint; it warps
   the lookup coordinates and reads the original field through them.
2. **Differential rotation → stretching and folding** — a rotation whose angle
   grows toward the centre winds a compact blob into spiral filaments.
   Interface length grows as feature width shrinks; that is what mixing *is*.
3. **Advection creates gradients; diffusion destroys them** — the unstable
   middle exists because the two act on different timescales, and uniformity
   is the only fixed point.
4. **The pour mechanics of a latte heart** — a round milk mass plus one
   vertical centre cut produces both the cleft and the tapered tail. One
   displacement, two features.
5. **Structure ≠ contrast** — boundary density at two scales separates
   coherent form from busyness: coherent contours survive blurring;
   pixel-scale noise does not.
6. **Computed, not quoted** — a displayed measurement must be derived from the
   artefact itself, or it is theatre.

**Learning residue**

- **Primitive learned:** the rise-and-fall of visible structure in mixing can
  be made measurable with nothing more than edge fractions at two scales and
  their ratio — no entropy estimation required.
- **Mistakes corrected:** two. The first curve measured the *gesture* (pointer
  winding), not the surface — decorative, not evidential. And the first
  comparison field was low-frequency fbm, which the measurement correctly
  scored as *structure*: clouds are coherent form. The measure disciplined the
  exhibit, which is what a real measure does.
- **Test I should now pass:** explain why random noise scores near zero under
  a fine/medium coherence gate while stirred filaments score high — and why
  raw contrast alone would invert that ranking.

**Check yourself**

1. Why does stirring *increase* visible structure before diffusion erases it?
2. Why must the comparison noise live at pixel scale for "busy is not
   structured" to be an honest demonstration?
3. Why does the score gate on the fine/medium boundary *ratio* rather than
   subtracting one from the other?

Because the field is a pure function of a handful of uniforms, the surface is
cheap and the render loop stops when nothing is changing.

## Files

- `FlatWhiteExperiment.tsx` — the island: state, animation timing, pointer
  interaction, the measurement cadence, the curve, the badge and the controls.
- `surface.ts` — the Three.js renderer: `ShaderMaterial`, quad, uniform
  plumbing, and the offscreen sampling target for the measurement.
- `shaders.ts` — the GLSL vertex and fragment shaders (the mixing model).
- `structure.ts` — the visible-structure score, computed from sampled pixels.

## Upgrade path

Replace the stateless `milkAt` in `shaders.ts` with a **ping-pong simulation**:
two `THREE.WebGLRenderTarget`s, advect + diffuse the milk field each step, and
sample the result. The renderer would gain the target pair and a step shader;
the component wiring and the page around it would not change.

## Accessibility & performance

- Pointer Events cover mouse and touch; `touch-action: none` on the canvas.
- `prefers-reduced-motion` freezes the surface shimmer and slows the diffusion
  clock; stirring stays user-driven.
- The `requestAnimationFrame` loop runs only while something is changing (a drag,
  live energy, an unfinished diffusion, or animated noise) and stops when idle.

## Running locally

It lives inside the site, so run the site — from the repo root:

```sh
npm install
npm run dev   # then open /experiments/flat-white/ or /projects/flat-white/
```
